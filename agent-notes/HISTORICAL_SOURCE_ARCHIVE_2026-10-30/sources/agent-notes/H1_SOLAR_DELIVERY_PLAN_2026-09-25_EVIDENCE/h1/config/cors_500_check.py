"""Does an unhandled exception (500) carry CORS headers with this FastAPI/Starlette version?"""
import fastapi, starlette
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/boom")
def boom():
    raise RuntimeError("unhandled")

@app.get("/busy")
def busy():
    raise HTTPException(status_code=503, detail="saturated", headers={"Retry-After": "2"})

c = TestClient(app, raise_server_exceptions=False)
print("fastapi", fastapi.__version__, "starlette", starlette.__version__)
for p in ("/boom", "/busy"):
    r = c.get(p, headers={"Origin": "http://localhost:5173"})
    print(p, r.status_code, "ACAO=", r.headers.get("access-control-allow-origin"),
          "Retry-After=", r.headers.get("retry-after"),
          "Access-Control-Expose-Headers=", r.headers.get("access-control-expose-headers"))
