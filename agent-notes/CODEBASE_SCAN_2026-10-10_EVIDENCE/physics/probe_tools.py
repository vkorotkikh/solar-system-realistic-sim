"""Read-only source probes; dangerous maintenance behavior runs only in a temp copy."""
import json,sys,shutil,tempfile,subprocess,hashlib,importlib.util
from pathlib import Path
ROOT=Path(sys.argv[1]).resolve();sys.path.insert(0,str(ROOT/'backend'));sys.path.insert(0,str(ROOT/'scripts'))
import rebound
from sim.radiation_pressure import rebound_radiation_pressure_callback
from sim.galactic_tide import rebound_galactic_tide_callback
from sim.tudatpy_hooks import TudatPyEngine
out={'snapshot':str(ROOT),'dormant_callbacks':{}}
for name,callback in [('radiation',rebound_radiation_pressure_callback),('galactic',rebound_galactic_tide_callback)]:
    s=rebound.Simulation();s.units=('yr','AU','Msun');s.add(m=1);s.add(a=10000);errors=[];types=[]
    def observe(arg):
        if errors:return
        types.append(type(arg).__name__)
        try:callback(arg)
        except Exception as e:errors.append(type(e).__name__+': '+str(e))
    s.additional_forces=observe;s.integrate(.0001)
    out['dormant_callbacks'][name]={'actual_rebound_argument_types':types,'errors':errors}
out['dormant_tudat_srp']={'reported_enabled_without_initialization':TudatPyEngine(enable_srp=True).get_state()['force_models']['srp']}
source=ROOT/'scripts/update-moons-data.mjs'
source_before=hashlib.sha256(source.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='solar-empty-moon-help-') as temp:
    temp=Path(temp);(temp/'scripts').mkdir();(temp/'src/data').mkdir(parents=True)
    shutil.copy2(source,temp/'scripts/update-moons-data.mjs')
    output=temp/'src/data/moons.json';output.write_text('[{"sentinel":"existing catalog"}]\n')
    preload=temp/'fetch-offline.mjs';preload.write_text('globalThis.fetch=async()=>({ok:true,text:async()=>\'<table id="sat_elem"><tbody></tbody></table>\'});\n')
    p=subprocess.run(['node','--import',str(preload),str(temp/'scripts/update-moons-data.mjs'),'--help'],capture_output=True,text=True)
    out['moon_help_empty_table']={'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'catalog_after':output.read_text(),'source_unchanged':source_before==hashlib.sha256(source.read_bytes()).hexdigest(),'only_temp_copy_executed':True}
# Exercise external-output crash with tiny archived in-memory row; no upstream calls.
import build_asteroid_phase1_dataset as build
with tempfile.TemporaryDirectory(prefix='solar-external-asteroid-') as temp:
    build._fetch_asteroids=lambda limit:[{}]
    build._build_records=lambda rows:([{'source_id':1,'epoch_jd':2451545,'a_au':2.5,'e':.1,'i_deg':1,'ascending_node_deg':2,'arg_periapsis_deg':3,'mean_anomaly_deg':4,'period_days':1000,'diameter_km':1,'albedo':.1,'taxonomy':0}],{'C':1,'S':0,'M':0},{'MBA':1})
    # Retain real write-order, substitute encoding/meta to isolate path logic.
    build._pack_binary=lambda records:b'audit fixture'
    build._write_meta=lambda path,*a,**k:path.write_text('{}')
    try:build.build_dataset(Path(temp),1,'audit.bin','audit.meta.json');status='success'
    except Exception as e:status=type(e).__name__+': '+str(e)
    out['asteroid_external_output']={'result':status,'created_files':sorted(p.name for p in Path(temp).iterdir()),'encoding_substituted':True}
print(json.dumps(out,indent=2))
