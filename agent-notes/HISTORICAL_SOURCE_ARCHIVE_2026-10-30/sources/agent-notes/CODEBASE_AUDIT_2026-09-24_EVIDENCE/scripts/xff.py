"""M-6: solar rate limit vs spoofed X-Forwarded-For. Usage: PORT=8042 python xff.py"""
import os, collections, httpx
B = f"http://127.0.0.1:{os.environ.get('PORT','8042')}"; q = {"jd": 2461307.5, "fidelity": "preview", "max_features": 64}
with httpx.Client(timeout=60) as c:
    print("same XFF   :", dict(collections.Counter(c.get(B+"/solar/physics", params=q, headers={"X-Forwarded-For": "203.0.113.7"}).status_code for _ in range(40))))
    print("rotated XFF:", dict(collections.Counter(c.get(B+"/solar/physics", params=q, headers={"X-Forwarded-For": f"198.51.100.{i}"}).status_code for i in range(40))))
