import asyncio,json,math,os,time,websockets
SP=os.environ["SP"]; PORT=os.environ["PORT"]
hz=json.load(open(SP+"/hz/horizons_2026-09-24.json"))["bary_ssb"]; AU=149597870.7; DAY=86400.0
async def recv(ws,t=180): return json.loads(await asyncio.wait_for(ws.recv(),t))
async def main():
    rows=[]; seeks=[]
    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws/sim",max_size=None,open_timeout=30) as ws:
        await recv(ws); await ws.send(json.dumps({"type":"pause"}))
        for jd in [2451545.0,2451910.25,2455197.5,2461307.5,2469807.5,2488069.5]:
            t0=time.time(); await ws.send(json.dumps({"type":"set_julian_date","jd":jd,"jd_time_scale":"TDB"}))
            frames=[]; final=None
            while time.time()-t0<300:
                m=await recv(ws)
                if m.get("type")=="error": final=m; break
                if m.get("type")=="state_update":
                    frames.append(m["jd"])
                    if abs(m["jd"]-jd)<1e-6: final=m; break
            seeks.append(dict(req=jd,frames_seen=len(frames),first_jds=frames[:4],last_jd=frames[-1] if frames else None,
                              secs=round(time.time()-t0,2),result=(final or {}).get("type"),msg=(final or {}).get("message")))
            if not final or final.get("type")!="state_update": continue
            b=final["bodies"]; s=b["sun"]; ts=[x for x in hz['sun'] if x['jd']==jd][0]
            for n in ('mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'):
                t=[x for x in hz[n] if x['jd']==jd][0]
                mp=[b[n]['pos'][i]-s['pos'][i] for i in range(3)]; tp=[t[k]-ts[k] for k in 'xyz']
                mv=[b[n]['vel'][i]-s['vel'][i] for i in range(3)]; tv=[t[k]-ts[k] for k in ('vx','vy','vz')]
                rows.append(dict(jd=jd,body=n,drKm=math.dist(mp,tp)*AU,dvMs=math.dist(mv,tv)*AU/DAY*1000,energy_error=final.get('energy_error')))
    for s in seeks: print("seek",s)
    json.dump(dict(rows=rows,seeks=seeks),open(SP+"/out/rebound_vs_horizons.json","w"),indent=1)
    eps=sorted({r['jd'] for r in rows})
    print("\nREBOUND heliocentric position error (km), frames matched on reported jd")
    print("body     "+"".join(f"{e:>12.2f}" for e in eps))
    for n in ('mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'):
        print(f"{n:9s}"+"".join(f"{next((r['drKm'] for r in rows if r['jd']==e and r['body']==n),float('nan')):12.1f}" for e in eps))
    print("\nvelocity error (m/s)")
    for n in ('mercury','earth','jupiter','neptune'):
        print(f"{n:9s}"+"".join(f"{next((r['dvMs'] for r in rows if r['jd']==e and r['body']==n),float('nan')):12.4f}" for e in eps))
asyncio.run(main())
