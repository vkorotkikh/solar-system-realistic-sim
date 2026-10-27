"""Offline independent solar probes; argv[1] is immutable branch extraction."""
import sys, json, math, time, io, socket, threading, http.client
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone

root = Path(sys.argv[1])
sys.path.insert(0, str(root / 'backend'))
import numpy as np
from sim import pfss_magnetogram as pfss
from sim import solar_physics as physics
from sim import solar_realtime_data as rt

out = {'branch': root.name, 'numpy': np.__version__}
mu, weights = np.polynomial.legendre.leggauss(128)
p = pfss._associated_legendre(3, np.asarray([0.5]))
q = pfss._associated_legendre(3, mu)
out['basis'] = {'P2_at_half': float(p[2,0][0]), 'P3_at_half': float(p[3,0][0]), 'P0_P2_integral': float(np.dot(weights, q[0,0] * q[2,0]))}

# An independent stationary-point calculation: differentiating x^3/(exp(x^2)-c)
# gives (3-2*x^2)*exp(x^2)-3*c=0. No empirical solar oracle is asserted.
b,c = physics.HATHAWAY_B, physics.HATHAWAY_C
lo,hi=.01,math.sqrt(1.5)
for _ in range(80):
    x=(lo+hi)/2
    if (3-2*x*x)*math.exp(x*x)-3*c > 0: lo=x
    else: hi=x
actual_peak=b*(lo+hi)/2
assumed_peak=b*math.sqrt(1.5)
month_samples=np.linspace(0,132,13201)
plateau=[float(t) for t in month_samples if physics._hathaway_normalized(float(t)) == 1.0]
out['hathaway']={'b':b,'c':c,'actual_peak_month':actual_peak,'normalization_peak_month':assumed_peak,'actual_to_normalization_amplitude_ratio':physics._hathaway_raw(actual_peak)/physics._hathaway_raw(assumed_peak),'clamped_plateau_month_range':[min(plateau),max(plateau)]}

if hasattr(pfss, '_parse_fits_primary_image'):
    cards=["SIMPLE  =                    T", "BITPIX  =                  -32", "NAXIS   =                    2", "NAXIS1  =                   12", "NAXIS2  =                   12", "END"]
    header=''.join(card.ljust(80) for card in cards).ljust(2880).encode('ascii')
    data=np.arange(144,dtype='>f4').tobytes().ljust(2880,b'\0')
    try: out['fits']={'shape':list(pfss._parse_fits_primary_image(header+data).shape)}
    except Exception as e: out['fits']={'error':type(e).__name__,'message':str(e)}
else:
    sys.path.insert(0,str(root/'backend/tests'))
    import gong_fixture_helpers as fixture
    from sim import gong_magnetogram as gong
    snapshot=gong.parse_gong_fits(fixture.EXPANDED,context=fixture.context())
    out['fits']={'shape':list(snapshot.field_gauss.shape),'first_pixel_gauss':float(snapshot.field_gauss[0,0]),'grid_area_sum':float(np.sum(snapshot.grid.area_weights)*2*np.pi),'row_order':snapshot.grid.row_order,'read_only':not snapshot.field_gauss.flags.writeable}
    from sim.magnetogram_grid import equal_area_sine_latitude_grid
    grid=equal_area_sine_latitude_grid(48,96)
    # Analytic real l=2,m=1 Schmidt mode is sqrt(3)*mu*sqrt(1-mu^2)*cos(phi).
    values=np.sqrt(3)*grid.mu[:,None]*np.sqrt(1-grid.mu[:,None]**2)*np.cos(grid.phi_rad)[None,:]
    g,h=pfss.decompose_spherical_harmonics(values,lmax=15,grid=grid)
    residual=g.copy();residual[2,1]-=1
    field=pfss.pfss_solve(g,h,15)
    out['quadrupole']={'g21':float(g[2,1]),'other_max_abs':float(max(np.max(abs(residual)),np.max(abs(h)))),'photosphere_Br':field.evaluate(1,math.acos(.5),0)[0],'expected_Br':.75,'source_surface_tangential':list(field.evaluate(2.5,1.0,.3)[1:])}
    from sim.pfss_tracing import trace_field_batch
    dipole_g=np.zeros((2,2));dipole_g[1,0]=1
    dipole=pfss.pfss_solve(dipole_g,np.zeros_like(dipole_g),1)
    angles=np.asarray([.2,.5,.8,1.0,1.3])
    starts=np.column_stack((np.sin(angles),np.zeros(5),np.cos(angles)))
    traces=trace_field_batch(dipole,starts,max_steps=600,step_size=.01)
    polar_cap_sin2=3/(2*2.5+2.5**-2)
    expected=np.where(np.sin(angles)**2<polar_cap_sin2,'open','closed')
    out['dipole_trace']={'angles_rad':angles.tolist(),'states':traces.states.tolist(),'expected_analytic_states':expected.tolist(),'maximum_boundary_residual':float(np.max(traces.endpoint_radius_residuals))}
    # Accepted FITS float64 science cannot generally reconstruct exact raw
    # bytes after lossy roundoff-only monopole removal.
    floating=np.resize(np.array([1.,-1.]),(180,360))+1e-13
    floating[0,0]=1e-30;floating[0,1]=0
    valid_float=gong.parse_gong_fits(fixture.rewrite_fits(data=floating),context=fixture.context())
    try:
        pfss.PFSSCache._validate_observed_snapshot_contract(valid_float)
        validation_error=None
    except Exception as e:validation_error={'type':type(e).__name__,'message':str(e)}
    out['accepted_float_snapshot_rejected_by_pfss']={'fits_parser_accepted':True,'bitpix':-64,'removed_mean_gauss':valid_float.provenance.flux.removed_mean_g,'pfss_validation_error':validation_error,'runtime':'offline observed pipeline; observed runtime disabled'}

model=physics.SolarCoronaPhysicsModel(seed=17,base_tube_count=32)
stale={'fetched_at_utc':'2000-01-01T00:00:00Z','combined_activity_proxy':.1,'source_status':{'swpc':{'ok':True}},'swpc':{'time_tag':'2000-01-01T00:00:00Z','activity_proxy':.1}}
try:
    activity,assimilation,wind=model._apply_realtime_forcing(.8,'hybrid',stale)
    out['stale_forcing']={'activity':activity,'assimilation':assimilation,'wind_override':wind}
except Exception as e: out['stale_forcing']={'error':str(e)}

if hasattr(rt.SolarRealtimeDataProvider, '_request_bounded_http_payload'):
    provider=rt.SolarRealtimeDataProvider(timeout_s=.05,cache_ttl_s=300)
    now=datetime(2026,10,10,12,tzinfo=timezone.utc)
    tick=[100.0]; recovered=[False]; calls=[]
    def swpc():
        calls.append(('swpc',tick[0]))
        if not recovered[0]: raise RuntimeError('brief offline outage')
        return {'time_tag':now.isoformat(),'wind_time_tag':now.isoformat(),'mag_time_tag':now.isoformat(),'activity_proxy':.2}
    def unavailable(*args): raise RuntimeError('offline unused companion')
    provider._fetch_swpc=swpc; provider._fetch_silso=unavailable; provider._fetch_sdo_aia=unavailable
    with patch.object(rt.time,'monotonic',side_effect=lambda:tick[0]),patch.object(provider,'_utc_now',return_value=now):
        first=provider.latest()
        recovered[0]=True;tick[0]=105
        second=provider.latest()
        tick[0]=399
        third=provider.latest()
        tick[0]=401
        fourth=provider.latest()
    out['outage_cache']={'swpc_acquisitions':calls,'swpc_ok_at_0_5_299_301_seconds':[s['source_status']['swpc']['ok'] for s in (first,second,third,fourth)],'ttl_seconds':provider.cache_ttl_s,'declared_failure_backoff_seconds':provider.singleflight_error_backoff_s}

    # Real http.client and urllib header parser, socketpair only: HTTPS connect
    # is replaced to attach the local socket. URL/redirect/deadline code is real.
    left,right=socket.socketpair();left.settimeout(.05)
    def drip_headers():
        try:
            right.sendall(b'HTTP/1.1 200 OK\r\nX-Drip: ')
            for _ in range(20): time.sleep(.02);right.sendall(b'a')
            right.sendall(b'\r\nContent-Length: 2\r\n\r\n{}')
        except OSError: pass
        finally:right.close()
    def local_connect(connection): connection.sock=left
    sender=threading.Thread(target=drip_headers);sender.start()
    provider=rt.SolarRealtimeDataProvider(timeout_s=.05)
    started=time.monotonic()
    try:
        with patch('urllib.request.getproxies',return_value={}),patch.object(http.client.HTTPSConnection,'connect',local_connect):
            provider._request_bytes(provider.NOAA_WIND_URL,max_bytes=100)
        error=None
    except Exception as e:error={'type':type(e).__name__,'code':getattr(e,'code',None),'message':str(e)}
    elapsed=time.monotonic()-started;left.close();sender.join()
    out['realtime_drip_headers']={'budget_s':.05,'elapsed_s':elapsed,'error':error,'network':'local socketpair; no external requests'}

    # DNS timeout is not enforced by urllib's socket timeout argument.
    def delayed_dns(*args,**kwargs): time.sleep(.20);raise socket.gaierror(socket.EAI_AGAIN,'offline delayed DNS')
    started=time.monotonic()
    try:
        with patch('urllib.request.getproxies',return_value={}),patch.object(socket,'getaddrinfo',side_effect=delayed_dns):
            provider._request_bytes(provider.NOAA_WIND_URL,max_bytes=100)
    except Exception as e:error={'type':type(e).__name__,'message':str(e)}
    out['realtime_delayed_dns']={'budget_s':.05,'elapsed_s':time.monotonic()-started,'error':error}

    # GONG offline transport retains read(n), unlike realtime's read1 fix.
    left,right=socket.socketpair();left.settimeout(.05)
    right.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\n')
    response=http.client.HTTPResponse(left);response.begin()
    bounded=gong._BoundedHttpResponse(response,clock=time.monotonic,read_timeout_s=.05,stall_timeout_s=.05,sock=left,url=gong.GONG_ARCHIVE_BASE_URL)
    def drip_body():
        try:
            for _ in range(20): time.sleep(.02);right.sendall(b'a')
        except OSError: pass
        finally:right.close()
    sender=threading.Thread(target=drip_body);sender.start();started=time.monotonic()
    try:bounded.read(20);error=None
    except Exception as e:error={'type':type(e).__name__,'code':getattr(e,'code',None)}
    out['gong_drip_body']={'budget_s':.05,'elapsed_s':time.monotonic()-started,'error':error,'runtime':'offline provider; GONG scientific runtime disabled'}
    bounded.close();sender.join()

print(json.dumps(out,indent=2,allow_nan=False))
