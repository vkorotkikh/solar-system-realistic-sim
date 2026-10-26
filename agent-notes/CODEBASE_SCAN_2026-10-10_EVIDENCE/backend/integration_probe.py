"""Small offline route/identity comparisons; heavy computation replaced."""
import sys, json
from pathlib import Path
from unittest.mock import patch
root=Path(sys.argv[1]);sys.path.insert(0,str(root/'backend'))
import server
from fastapi.testclient import TestClient
from starlette.requests import Request
client=TestClient(server.app)
out={'branch':root.name,'origins':[],'epochs':[],'identity':{}}
for origin in ['http://localhost:4173','http://127.0.0.1:4173','http://localhost:5173','https://untrusted.invalid']:
    r=client.options('/solar/physics',headers={'Origin':origin,'Access-Control-Request-Method':'GET'})
    out['origins'].append({'origin':origin,'status':r.status_code,'allow_origin':r.headers.get('access-control-allow-origin')})
calls=[]
async def fake_process(request,runner,payload,**kwargs):calls.append(payload['epoch_jd_tdb']);return {'probe_epoch':payload['epoch_jd_tdb']}
def fake_thread(epoch,*args,**kwargs):calls.append(epoch);return {'probe_epoch':epoch}
is_new=hasattr(server,'_run_request_owned_process')
with patch.object(server,'_run_request_owned_process',fake_process) if is_new else patch.object(server,'_build_solar_physics_state',fake_thread):
    for value in [2451545.0,1e30,-1e30]:
        before=len(calls)
        r=client.get('/solar/physics',params={'jd':str(value),'fidelity':'preview','max_features':8})
        out['epochs'].append({'jd':value,'status':r.status_code,'body':r.json(),'admitted_to_fake_compute':len(calls)>before})
for flavor in ['xff','key']:
    server._solar_physics_rate_locks.clear()
    identities=set();accepted=0;rejected=0
    for n in range(50):
        headers=[(b'x-forwarded-for',f'203.0.113.{n}'.encode())] if flavor=='xff' else [(b'x-api-key',f'audit-unvalidated-{n}'.encode())]
        req=Request({'type':'http','http_version':'1.1','method':'GET','scheme':'http','path':'/solar/physics','raw_path':b'/solar/physics','query_string':b'','headers':headers,'client':('198.51.100.9',40000),'server':('127.0.0.1',8042)})
        identities.add(server._client_identity(req))
        try:server._enforce_solar_request_rate_limit(req);accepted+=1
        except server.HTTPException:rejected+=1
    out['identity'][flavor]={'accepted':accepted,'rejected':rejected,'rate_store_entries':len(server._solar_physics_rate_locks),'client_identity_count':len(identities)}
print(json.dumps(out,indent=2))
