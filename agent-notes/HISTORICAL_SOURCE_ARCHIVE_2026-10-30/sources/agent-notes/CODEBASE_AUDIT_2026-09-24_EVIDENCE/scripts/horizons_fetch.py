import urllib.request,urllib.parse,re,json,time,sys,datetime
def _fetch(cmd,center,jds,units='AU-D'):
    tl=' '.join(f"'{j}'" for j in jds)
    p={'format':'text','COMMAND':f"'{cmd}'",'OBJ_DATA':'NO','MAKE_EPHEM':'YES','EPHEM_TYPE':'VECTORS',
       'CENTER':f"'{center}'",'REF_PLANE':'ECLIPTIC','REF_SYSTEM':'ICRF','VEC_TABLE':'2','VEC_CORR':'NONE',
       'OUT_UNITS':units,'TLIST':tl,'TLIST_TYPE':'JD','TIME_TYPE':'TDB','VEC_LABELS':'YES','CSV_FORMAT':'NO'}
    u='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode(p)
    for a in range(4):
        try: t=urllib.request.urlopen(u,timeout=120).read().decode(); break
        except Exception as e:
            if a==3: raise
            time.sleep(4)
    blk=re.search(r'\$\$SOE(.*?)\$\$EOE',t,re.S)
    if not blk: raise RuntimeError(t[:600])
    recs=[]
    for m in re.finditer(r'(\d+\.\d+)\s*=\s*A\.D\.[^\n]*\n(.*?)(?=\n\d+\.\d+\s*=\s*A\.D\.|\Z)',blk.group(1),re.S):
        jd=float(m.group(1)); b=m.group(2)
        g=lambda k: float(re.search(rf'\b{k}\s*=\s*([-\dEe\.\+]+)',b).group(1))
        recs.append({'jd':jd,'x':g('X'),'y':g('Y'),'z':g('Z'),'vx':g('VX'),'vy':g('VY'),'vz':g('VZ')})
    ver=re.search(r'Horizons Version\s*=?\s*([^\n]+)',t) or re.search(r'Ephemeris / API_USER ([^\n]+)',t)
    return recs,(t.split('\n')[0:3])
MONTHS={'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}
def _jd(y,mo,d):
    a=(14-mo)//12; yy=y+4800-a; m=mo+12*a-3
    return d+(153*m+2)//5+365*yy+yy//4-yy//100+yy//400-32045-0.5
def fetch(cmd,center,jds,units='AU-D'):
    jds=list(jds); skipped=[]
    for _ in range(4):
        try:
            r,h=_fetch(cmd,center,jds,units); return r,skipped
        except RuntimeError as e:
            m=re.search(r'(prior to|after) A\.D\. (\d+)-([A-Z]{3})-(\d+)',str(e))
            if not m: raise
            lim=_jd(int(m.group(2)),MONTHS[m.group(3)],int(m.group(4)))
            keep=[j for j in jds if (j>=lim+1 if m.group(1)=='prior to' else j<=lim-1)]
            skipped+= [j for j in jds if j not in keep]; jds=keep
    raise RuntimeError('clip failed')
PLANET_EP=[2378496.5,2396758.5,2415020.5,2451545.0,2461307.5,2469807.5,2488069.5,2524562.5]
MOON_EP=[2451545.0,2451575.0,2451910.0,2453371.0,2461307.5,2469807.5]
REB_EP=[2433282.5,2451545.0,2451910.25,2455197.5,2461307.5,2469807.5,2488069.5]
out={'_retrieved_utc':datetime.datetime.utcnow().isoformat()+'Z','_frame':'ecliptic J2000 / ICRF, geometric (VEC_CORR=NONE), TDB','planets_helio':{},'bary_ssb':{},'moons':{}}
P={'mercury':'199','venus':'299','earth':'399','mars':'499','jupiter':'599','saturn':'699','uranus':'799','neptune':'899','pluto':'999'}
for n,c in P.items():
    out['planets_helio'][n],sk=fetch(c,'500@10',PLANET_EP); out.setdefault('_skipped',{})[n]=sk; print('helio',n,len(out['planets_helio'][n]),flush=True)
B={'sun':'10','mercury':'199','venus':'299','earth':'399','moon':'301','mars':'4','jupiter':'5','saturn':'6','uranus':'7','neptune':'8','pluto':'9'}
for n,c in B.items():
    out['bary_ssb'][n],sk=fetch(c,'500@0',REB_EP); print('ssb',n,len(out['bary_ssb'][n]),flush=True)
M={'Moon':('301','399'),'Io':('501','599'),'Europa':('502','599'),'Ganymede':('503','599'),'Callisto':('504','599'),
   'Himalia':('506','599'),'Pasiphae':('508','599'),'Sinope':('509','599'),'Carme':('511','599'),
   'Mimas':('601','699'),'Enceladus':('602','699'),'Tethys':('603','699'),'Dione':('604','699'),'Rhea':('605','699'),
   'Titan':('606','699'),'Iapetus':('608','699'),'Phoebe':('609','699'),
   'Miranda':('705','799'),'Ariel':('701','799'),'Titania':('703','799'),'Cordelia':('706','799'),
   'Triton':('801','899'),'Nereid':('802','899'),'Charon':('901','999'),'Phobos':('401','499'),'Deimos':('402','499')}
for n,(c,par) in M.items():
    try:
        out['moons'][n]={'parent':par,'recs':fetch(c,'500@'+par,MOON_EP,units='KM-S')[0]}
        print('moon',n,len(out['moons'][n]['recs']),flush=True)
    except Exception as e: print('FAIL moon',n,str(e)[:120],flush=True)
json.dump(out,open('horizons_2026-09-24.json','w'),indent=1)
print('DONE')
