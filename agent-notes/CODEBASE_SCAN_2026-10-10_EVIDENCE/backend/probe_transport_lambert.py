"""Offline bounded supplemental audit. Real solver, analytic circular truth; Event-stalled local transport.
Exit 0 records observations, not passing scientific assertions. Product source untouched.
"""
import hashlib,json,math,sys,threading,time,urllib.request
from pathlib import Path
ROOT=Path(sys.argv[1]).resolve();sys.path.insert(0,str(ROOT/'backend'))
import rebound
from trajectory.lambert import solve_lambert_universal
from mission.orbital import MU_SUN_AU3_DAY2
from mission.ephemeris_service import EphemerisService,HORIZONS_CONCURRENCY_LIMIT
from trajectory.budget import PlanningContext
n=math.sqrt(MU_SUN_AU3_DAY2);speed_conversion=149597870700/86400
out={'snapshot':str(ROOT),'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['backend/trajectory/lambert.py','backend/mission/ephemeris_service.py']},'lambert':[]}
for degrees in [90,170,179,179.9,179.99,179.999,179.9999,179.99999,179.999999,180,180.000001,180.0001,181,190,270]:
 theta=math.radians(degrees);r2=[math.cos(theta),math.sin(theta),0]
 if degrees==180:r2=[-1,0,0]
 solution=solve_lambert_universal([1,0,0],r2,theta/n)
 row={'angle_deg':degrees,'tof_days':theta/n,'solved':solution is not None}
 if solution:
  expect1=[0,n,0];expect2=[-n*math.sin(theta),n*math.cos(theta),0]
  sim=rebound.Simulation();sim.G=MU_SUN_AU3_DAY2;sim.integrator='ias15';sim.add(m=1);sim.add(m=0,x=1,vx=solution['v1'][0],vy=solution['v1'][1],vz=solution['v1'][2]);sim.integrate(theta/n);particle=sim.particles[1]
  row['independent_rebound_endpoint_error_km']=math.dist([particle.x,particle.y,particle.z],r2)*149597870.7
  row.update({'v1_error_m_s':math.dist(solution['v1'],expect1)*speed_conversion,'v2_error_m_s':math.dist(solution['v2'],expect2)*speed_conversion,'solution':solution})
 out['lambert'].append(row)
# Each caller gets its own valid request-owned context; transport timeout is 50ms.
release=threading.Event();entered=threading.Event();closed=threading.Event();calls=[];original=urllib.request.urlopen
class LocalResponse:
 def __enter__(self):return self
 def __exit__(self,*args):closed.set()
 def read(self,limit):
  entered.set()
  if len(calls)==1:
   if not release.wait(1):raise RuntimeError('audit fail-safe released blocked transport')
  return b'local-body'
def fake_open(request,timeout):calls.append({'timeout_s':timeout,'url':request.full_url});return LocalResponse()
def request_once(label):
 service=EphemerisService([],provider='horizons',context=PlanningContext.with_timeout(2))
 t=time.monotonic()
 try:
  b=service._run_horizons_request(urllib.request.Request('https://offline.invalid/probe'),timeout_s=.05,body_id='earth',jd=2451545)
  return {'label':label,'elapsed_s':time.monotonic()-t,'status':'success','body':b.decode(),'outbound_calls_so_far':len(calls)}
 except Exception as e:return {'label':label,'elapsed_s':time.monotonic()-t,'status':type(e).__name__,'message':str(e),'outbound_calls_so_far':len(calls)}
urllib.request.urlopen=fake_open
try:
 first=request_once('first_stalled_read')
 if not entered.wait(.1):raise RuntimeError('local read did not start')
 second=request_once('second_while_first_still_blocked')
 before_release={'read_entered':entered.is_set(),'transport_closed':closed.is_set(),'outbound_calls':len(calls)}
 release.set()
 if not closed.wait(.5):raise RuntimeError('transport did not close')
 third=request_once('third_after_release')
 out['horizons_transport']={'global_concurrency_limit':HORIZONS_CONCURRENCY_LIMIT,'before_release':before_release,'requests':[first,second,third],'outbound_calls':calls}
finally:
 release.set();urllib.request.urlopen=original
 for worker in threading.enumerate():
  if worker.name=='horizons-transport':worker.join(timeout=.5)
print(json.dumps(out,indent=2))
