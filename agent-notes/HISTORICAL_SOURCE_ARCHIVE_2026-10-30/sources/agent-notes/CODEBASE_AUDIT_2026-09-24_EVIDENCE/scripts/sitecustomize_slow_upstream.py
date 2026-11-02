# Test harness only: simulate JPL Horizons being unreachable (connect hangs until the client timeout).
import urllib.request, urllib.error, time
_orig = urllib.request.urlopen
def _slow(url, *a, **k):
    u = url if isinstance(url, str) else getattr(url, "full_url", "")
    if "ssd.jpl.nasa.gov" in u:
        time.sleep(float(k.get("timeout") or 10.0))
        raise urllib.error.URLError("simulated: upstream unreachable (timeout)")
    return _orig(url, *a, **k)
urllib.request.urlopen = _slow
