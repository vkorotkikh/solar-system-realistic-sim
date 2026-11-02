import gzip,json,os,socket,subprocess,sys,time,urllib.parse,urllib.request
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=open('/tmp/solar-wire-server.log','w')
process=subprocess.Popen([sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port',str(port),'--no-proxy-headers'],stdout=log,stderr=log)
origin=f'http://127.0.0.1:{port}'
try:
 for _ in range(100):
  try:
   urllib.request.urlopen(origin+'/health',timeout=1).read();break
  except OSError: time.sleep(.1)
 else: raise RuntimeError('server readiness timeout')
 def request(query):
  req=urllib.request.Request(origin+'/solar/physics?'+urllib.parse.urlencode(query),headers={'Accept-Encoding':'gzip'})
  with urllib.request.urlopen(req,timeout=25) as response:
   wire=response.read();encoding=response.headers.get('Content-Encoding')
  decoded=gzip.decompress(wire) if encoding=='gzip' else wire
  payload=json.loads(decoded)
  return payload,dict(encoded_bytes=len(wire),decoded_bytes=len(decoded),content_encoding=encoding,epoch=payload['epoch_jd_tdb'],geometry_included=payload.get('delivery',{}).get('geometry_included'),fallback=payload.get('fallback_reason'))
 query=dict(jd_tdb=2460000.5,fidelity='high',max_features=180,forcing='hybrid',live_data='true')
 rows={}
 _,rows['full_default']=request(query)
 first,rows['render_first']=request({**query,'delivery':'render-v1'})
 _,rows['unchanged_geometry']=request({**query,'delivery':'render-v1','geometry_version':first['delivery']['geometry_version']})
 _,rows['changed_epoch']=request({**query,'jd_tdb':2460001.5,'delivery':'render-v1','geometry_version':first['delivery']['geometry_version']})
 _,rows['reconnect']=request({**query,'delivery':'render-v1'})
 print(json.dumps(rows,indent=2))
 open('/tmp/solar-delivery-wire.json','w').write(json.dumps(rows,indent=2)+'\n')
finally:
 process.terminate()
 try:process.wait(timeout=10)
 except subprocess.TimeoutExpired:process.kill();process.wait()
 log.close()
