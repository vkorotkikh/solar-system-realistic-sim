"""Constant-acceleration ("torch") trip solver, Sun-centred part.  Reference implementation.

Problem: ship leaves body A at t0 with A's heliocentric velocity, must reach body B's position AND
velocity at t0+T.  Dynamics: Sun point-mass gravity + thrust of constant magnitude a.
Two continuous burns, each with a constant inertial direction (e1 for t1, e2 for t2), optionally a
coast tc between them with a delta-v budget a*(t1+t2).

Units inside: AU, day, AU/day (heliocentric ecliptic J2000).  Public inputs/outputs documented below.

Method (why it is fast):
  * propagation = Chebyshev-Picard collocation per arc segment (spectral accuracy, a Picard sweep is a
    handful of numpy ops on the whole batch, no per-step Python loop),
  * Jacobian = complex-step through that propagation: the six (seven with a coast) parameter
    perturbations ride along as batch rows, so F and the exact Jacobian cost one batched propagation,
  * damped Newton on the manifold of unit directions (tangent-plane coordinates re-based each
    iteration, no angle poles).
Run `python -B torch_reference.py` for the self-test.
"""
from __future__ import annotations

import math
import numpy as np
from numpy.polynomial import chebyshev as C

AU_KM = 149597870.7
GM_SUN_KM3S2 = 1.32712440018e11
G0 = 9.80665
DAY = 86400.0
R_SUN_AU = 695700.0 / AU_KM
MU = GM_SUN_KM3S2 * DAY ** 2 / AU_KM ** 3          # AU^3/day^2
AUD_MS = AU_KM * 1e3 / DAY                          # 1 AU/day in m/s


def g_to_aud2(a_g: float) -> float:
    """acceleration in g -> AU/day^2"""
    return a_g * G0 * 1e-3 * DAY ** 2 / AU_KM


# ----------------------------------------------------------------------------- Chebyshev operators
_OPS: dict = {}


def _ops(M: int):
    """nodes tau in [0,1] (Chebyshev-Gauss-Lobatto), cumulative-integral matrix P, interpolation inverse Vi."""
    if M not in _OPS:
        k = np.arange(M + 1)
        x = -np.cos(np.pi * k / M)
        V = C.chebvander(x, M)
        Vi = np.linalg.inv(V)
        Vint = C.chebvander(x, M + 1)
        Imat = np.zeros((M + 2, M + 1))
        for j in range(M + 1):
            c = np.zeros(M + 1)
            c[j] = 1.0
            Imat[:, j] = C.chebint(c, lbnd=-1)
        P = 0.5 * Vint @ Imat @ Vi
        _OPS[M] = (0.5 * (x + 1), P, Vi)
    return _OPS[M]


def _picard(r0, v0, ae, dur, mu, M, ptol, maxit):
    """One collocation segment.  r0,v0,ae:(B,3)  dur:(B,)  -> nodes R,V (B,M+1,3), iterations, converged."""
    tau, P, _ = _ops(M)
    s = tau[None, :, None] * dur[:, None, None]
    aeN = ae[:, None, :]
    R = r0[:, None, :] + v0[:, None, :] * s + 0.5 * aeN * s * s
    V = v0[:, None, :] + aeN * s
    if mu == 0.0:                                    # free space: quadratic guess is exact
        return R, V, 0, True
    d = dur[:, None, None]
    err = 1.0
    for it in range(1, maxit + 1):
        F = aeN - mu * R * ((R * R).sum(-1, keepdims=True)) ** -1.5
        Vn = v0[:, None, :] + d * (P @ F)
        Rn = r0[:, None, :] + d * (P @ Vn)
        err = max(np.abs(Rn - R).max() / max(np.abs(Rn).max(), 1e-3),
                  np.abs(Vn - V).max() / max(np.abs(Vn).max(), 1e-6))
        R, V = Rn, Vn
        if err < ptol:
            return R, V, it, True
    return R, V, maxit, err < 1e-9


def _meas_nodes(R):
    """path-change measure of one segment: swept angle seen from the Sun + |d ln r| (real parts)"""
    rn = np.sqrt((R * R).sum(-1))
    c = np.clip((R[:-1] * R[1:]).sum(-1) / (rn[:-1] * rn[1:]), -1.0, 1.0)
    return float(np.arccos(c).sum() + np.abs(np.diff(np.log(rn))).sum())


def _fractions(r0, v0, ae, dur, mu, phi_max):
    """segment boundaries (fractions of the arc) equidistributing a path-change measure along the free-space
    guess path: swept angle + |d ln r| + orbital phase.  Fast Sun fly-bys get short segments."""
    dr = float(np.real(dur[0]))
    tau = np.linspace(0.0, 1.0, 129)
    s = tau * dr
    rr = np.real(r0[0]) + np.real(v0[0]) * s[:, None] + 0.5 * np.real(ae[0]) * s[:, None] ** 2
    rn = np.maximum(np.sqrt((rr * rr).sum(-1)), 2e-3)
    c = np.clip((rr[:-1] * rr[1:]).sum(-1) / (rn[:-1] * rn[1:]), -1.0, 1.0)
    meas = np.arccos(c) + np.abs(np.diff(np.log(rn)))
    if mu:
        meas = meas + np.diff(tau) * dr * np.sqrt(mu / rn.min() ** 3)
    cum = np.concatenate([[0.0], np.cumsum(meas)])
    n = max(1, math.ceil(cum[-1] / phi_max))
    return np.interp(np.linspace(0.0, cum[-1], n + 1), cum, tau)


def propagate_arc(r0, v0, ae, dur, mu, M=16, phi_max=0.5, ptol=1e-13, maxit=60, rec=None, t_off=0.0, passes=5, rec_all=None):
    """Constant-acceleration arc (ae = a*e vector; zero for a coast), duration dur (B,), batched over B rows.
    Split into segments whose path-change measure is <= phi_max (rad-equivalent); after solving, any segment whose
    realised measure exceeds 2*phi_max is split again (gravity bends the path away from the free-space guess).
    rec (list) receives (t_days, R_nodes) of batch row 0."""
    fr = _fractions(r0, v0, ae, dur, mu, phi_max) if mu else np.array([0.0, 1.0])
    for _ in range(passes):
        rr, vv, buf, meas, ok_all = r0, v0, [], [], True
        buf_all = []
        t = t_off
        for k in range(len(fr) - 1):
            h = dur * (fr[k + 1] - fr[k])
            R, V, it, ok = _picard(rr, vv, ae, h, mu, M, ptol, maxit)
            if not ok:
                ok_all = False
                break
            rr, vv = R[:, -1], V[:, -1]
            Rk = np.real(R[0])
            buf_all.append(np.real(R))
            meas.append(_meas_nodes(Rk) if mu else 0.0)
            hr = float(np.real(h[0]))
            buf.append((t + _ops(M)[0] * hr, Rk.copy()))
            t += hr
        if ok_all:
            meas = np.array(meas)
            if not (meas > 2 * phi_max).any():
                if rec is not None:
                    rec.extend(buf)
                if rec_all is not None:
                    rec_all.extend(buf_all)
                return rr, vv
            new = [fr[0]]
            for k, m in enumerate(meas):
                p = max(1, math.ceil(m / phi_max)) if m > 2 * phi_max else 1
                new.extend(fr[k] + (fr[k + 1] - fr[k]) * np.arange(1, p + 1) / p)
            fr = np.array(new)
        else:
            fr = np.interp(np.linspace(0, len(fr) - 1, 2 * (len(fr) - 1) + 1), np.arange(len(fr)), fr)
    raise FloatingPointError("Picard collocation did not converge (path too close to the Sun?)")


propagate_arc_safe = propagate_arc


# ----------------------------------------------------------------------------- body helpers
def body_fn(body: dict):
    """state function from a data.bodies entry: jd -> (r AU, v AU/day) numpy arrays"""
    from mission.orbital import sample_body_state_from_elements as f

    def g(jd):
        s = f(body, float(jd))
        return np.array(s["position"], float), np.array(s["velocity"], float)
    return g


def rest_fn(r):
    r = np.array(r, float)
    return lambda jd: (r, np.zeros(3))


# ----------------------------------------------------------------------------- free-space estimates
def free_space_T(Afun, Bfun, t0, acc, iters=60, gravity=None):
    """Free-space (no Sun) two-burn estimate with moving bodies.  Returns dict(T,t1,t2,g1,g2,D,W,ok).
    With the displacement D(T)=rB(t0+T)-rA-vA*T and velocity mismatch W(T)=vB(t0+T)-vA, two constant-direction
    burns satisfy  g1=a t1 e1, g2=a t2 e2,  g1+g2=W,  g1*T/2 + W*t2/2 = D  =>  g1=(2D-W t2)/T,
    |g1|=a t1, |g2|=a t2, t1+t2=T  (2 scalar equations in T and t1; W=0 gives T=2 sqrt(|D|/a)).
    gravity='mid': add a uniform Sun pull evaluated at the chord midpoint (D->D-g T^2/2, W->W-g T)."""
    rA, vA = Afun(t0)

    def DW(T):
        rB, vB = Bfun(t0 + T)
        D = rB - rA - vA * T
        W = vB - vA
        if gravity == "mid":
            m = 0.5 * (rA + rB)
            g = -MU * m / np.linalg.norm(m) ** 3
            D = D - 0.5 * g * T * T
            W = W - g * T
        return D, W

    T = 2.0 * math.sqrt(np.linalg.norm(DW(1.0)[0]) / acc + 1e-30)
    for _ in range(6):                                  # E0: ignore W, iterate moving-B displacement
        T = 2.0 * math.sqrt(np.linalg.norm(DW(T)[0]) / acc)
    T0 = T
    s = 0.5

    def res(T, s):
        D, W = DW(T)
        t1, t2 = s * T, (1 - s) * T
        g1 = (2 * D - W * t2) / T
        g2 = W - g1
        return np.array([np.linalg.norm(g1) / (acc * T) - s, np.linalg.norm(g2) / (acc * T) - (1 - s)]), g1, g2

    ok = False
    for _ in range(iters):
        f, g1, g2 = res(T, s)
        if np.abs(f).max() < 1e-12:
            ok = True
            break
        J = np.empty((2, 2))
        for j, (dT, ds) in enumerate(((1e-6 * T, 0.0), (0.0, 1e-6))):
            J[:, j] = (res(T + dT, s + ds)[0] - f) / (dT + ds)
        try:
            dx = np.linalg.solve(J, -f)
        except np.linalg.LinAlgError:
            break
        lam = 1.0
        for _ in range(8):
            Tn, sn = T + lam * dx[0], s + lam * dx[1]
            if Tn > 0 and 1e-3 < sn < 1 - 1e-3 and np.abs(res(Tn, sn)[0]).max() < np.abs(f).max():
                break
            lam *= 0.5
        else:
            break
        T, s = T + lam * dx[0], s + lam * dx[1]
    f, g1, g2 = res(T, s)
    ok = ok or np.abs(f).max() < 1e-9
    if not ok:                                          # fall back to E0
        D, W = DW(T0)
        return dict(T=T0, t1=T0 / 2, t2=T0 / 2, g1=D, g2=-D, ok=False, T0=T0)
    return dict(T=T, t1=s * T, t2=(1 - s) * T, g1=g1, g2=g2, ok=True, T0=T0)


def naive_guess(Afun, Bfun, t0, acc):
    """the proposal's starting point: e1=-e2=direction to where B will be, t1=t2=sqrt(d/a)"""
    rA, _ = Afun(t0)
    T = 0.0
    for _ in range(8):
        d = np.linalg.norm(Bfun(t0 + 2 * T)[0] - rA) if T else np.linalg.norm(Bfun(t0)[0] - rA)
        T = math.sqrt(d / acc)
    e1 = Bfun(t0 + 2 * T)[0] - rA
    e1 /= np.linalg.norm(e1)
    return dict(e1=e1, e2=-e1, t1=T, t2=T, tc=0.0)


def better_guess(Afun, Bfun, t0, acc, gravity=None):
    fs = free_space_T(Afun, Bfun, t0, acc, gravity=gravity)
    g1, g2 = fs["g1"], fs["g2"]
    e1 = g1 / (np.linalg.norm(g1) + 1e-300)
    e2 = g2 / (np.linalg.norm(g2) + 1e-300)
    return dict(e1=e1, e2=e2, t1=fs["t1"], t2=fs["t2"], tc=0.0)


# ----------------------------------------------------------------------------- the solver
def _basis(e):
    ax = np.eye(3)[int(np.argmin(np.abs(e)))]
    b1 = np.cross(e, ax)
    b1 /= np.linalg.norm(b1)
    return b1, np.cross(e, b1)


_IF: dict = {}


def _closest_sun(rec, M):
    """closest distance to the Sun (AU) and its time (days after t0) from the collocation segments:
    coarse scan of every segment polynomial, then golden-section refinement in the best segment only"""
    tau, _, Vi = _ops(M)
    xf = np.linspace(-1, 1, 81)
    if M not in _IF:
        _IF[M] = C.chebvander(xf, M) @ Vi
    If = _IF[M]
    best = (1e99, 0, 0)
    for k, (tn, R) in enumerate(rec):
        rf = If @ R
        d = np.sqrt((rf * rf).sum(-1))
        i = int(np.argmin(d))
        if d[i] < best[0]:
            best = (float(d[i]), k, i)
    _, k, i = best
    tn, R = rec[k]
    lo, hi = xf[max(i - 1, 0)], xf[min(i + 1, len(xf) - 1)]
    coef = Vi @ R                                           # Chebyshev coefficients of the segment

    def dist(x):
        return float(np.linalg.norm(C.chebval(x, coef)))
    for _ in range(40):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if dist(m1) < dist(m2):
            hi = m2
        else:
            lo = m1
    xm = 0.5 * (lo + hi)
    return dist(xm), float(tn[0] + (tn[-1] - tn[0]) * (xm + 1) / 2)


# about 2x faster than the defaults, worst arrival error 12 km / 0.01 m/s on the 252-case sample (speed2.out);
# use solve_trip(..., **FAST) and retry with the defaults if ok is False
FAST = dict(M=12, phi_max=1.0, ptol=1e-11, ntol=1e-9)


def solve_trip(Afun, Bfun, t0, a_g, dv_budget=None, mu=MU, guess=None, M=16, phi_max=0.5, ptol=1e-13,
               ntol=1e-11, maxit=40, want_path=True, dB=1e-2, nfloor=1e-9, jacobian='complex', fdh=1e-7):
    """Solve one torch trip.
    Afun,Bfun: jd -> (r[3] AU, v[3] AU/day) heliocentric.  t0: Julian date.  a_g: thrust acceleration in g.
    dv_budget: optional total delta-v in m/s (adds a coast, 7 unknowns).  guess: dict(e1,e2,t1,t2[,tc], days)
    or None (better_guess).  Returns dict: ok, msg, T (days), t1, t2, coast (days), e1, e2 (unit vectors),
    dv (m/s) = a*(t1+t2), path (K,4: days after t0, x,y,z AU), rmin_sun (AU), t_rmin (days), iters, nfev,
    resid_r (km), resid_v (m/s)."""
    acc = g_to_aud2(a_g)
    rA, vA = Afun(t0)
    coast = dv_budget is not None
    g = guess if guess is not None else better_guess(Afun, Bfun, t0, acc)
    e1, e2 = np.array(g["e1"], float), np.array(g["e2"], float)
    e1 /= np.linalg.norm(e1)
    e2 /= np.linalg.norm(e2)
    t1, t2 = float(g["t1"]), float(g["t2"])
    tc = float(g.get("tc", 0.0))
    if coast and tc <= 0:
        tc = 1e-3 * (t1 + t2)
    Tg = max(t1 + t2, 1e-6)
    d0 = max(np.linalg.norm(Bfun(t0 + Tg)[0] - rA), 1e-3)
    Lr, Lv = d0, max(acc * Tg, 1e-6)
    npar = 7 if coast else 6
    scale = np.array([Lr] * 3 + [Lv] * 3 + ([Lv] if coast else []))
    pscale = np.array([1.0] * 4 + [Tg] * (3 if coast else 2))
    HH = 1e-30
    nfev = 0

    def evaluate(e1, e2, t1, t2, tc, jac=True):
        nonlocal nfev
        nfev += 1
        fd = jac and jacobian == "fd"            # forward-difference Jacobian (baseline) instead of complex step
        n = (npar + 1) if fd else (npar if jac else 1)
        if fd:
            hs = np.array([fdh] * 4 + [fdh * Tg] * (npar - 4))
            X = np.zeros((n, npar))
            X[1 + np.arange(npar), np.arange(npar)] = hs
        else:
            X = np.zeros((n, npar), complex)
            if jac:
                X[np.arange(n), np.arange(n)] = 1j * HH
        dt = float if fd else complex
        b11, b12 = _basis(e1)
        b21, b22 = _basis(e2)
        E1 = e1 + X[:, 0:1] * b11 + X[:, 1:2] * b12
        E2 = e2 + X[:, 2:3] * b21 + X[:, 3:4] * b22
        T1 = t1 + X[:, 4]
        T2 = t2 + X[:, 5]
        TC = (tc + X[:, 6]) if coast else None
        r = np.tile(rA.astype(dt), (n, 1))
        v = np.tile(vA.astype(dt), (n, 1))
        rec = [] if (not jac and want_path) else None
        r, v = propagate_arc(r, v, acc * E1, T1, mu, M, phi_max, ptol, rec=rec, t_off=0.0)
        tt = t1
        if coast:
            r, v = propagate_arc(r, v, np.zeros_like(E1), TC, mu, M, phi_max, ptol, rec=rec, t_off=tt)
            tt += tc
        r, v = propagate_arc(r, v, acc * E2, T2, mu, M, phi_max, ptol, rec=rec, t_off=tt)
        T = t1 + t2 + (tc if coast else 0.0)
        rB, vB = Bfun(t0 + T)
        F = np.concatenate([np.real(r[0]) - rB, np.real(v[0]) - vB])
        if coast:
            F = np.append(F, acc * (t1 + t2) - dv_budget / AUD_MS)
        J = None
        if jac:
            J = np.zeros((F.size, npar))
            if fd:
                Tr = T + X[:, 4] + X[:, 5] + (X[:, 6] if coast else 0.0)
                for i in range(1, n):
                    rBi, vBi = Bfun(t0 + Tr[i])
                    Fi = np.concatenate([r[i] - rBi, v[i] - vBi])
                    J[:6, i - 1] = (Fi - F[:6]) / hs[i - 1]
            else:
                Y = np.concatenate([np.imag(r), np.imag(v)], axis=1) / HH        # (n, 6): d y_final / d p_i
                rBp, vBp = Bfun(t0 + T + dB)
                rBm, vBm = Bfun(t0 + T - dB)
                dyB = np.concatenate([(rBp - rBm), (vBp - vBm)]) / (2 * dB)
                J[:6, :] = Y.T
                for c in ([4, 5, 6] if coast else [4, 5]):
                    J[:6, c] -= dyB
            if coast:
                J[6, 4] = J[6, 5] = acc
        return F, J, rec, (r, v, rB, vB)

    try:
        F, J, _, _ = evaluate(e1, e2, t1, t2, tc)
    except FloatingPointError:
        return dict(ok=False, msg="Picard collocation failed at the starting guess", iters=0, nfev=nfev, nF=float("nan"),
                    e1=e1, e2=e2, t1=t1, t2=t2, coast=tc if coast else 0.0, T=t1 + t2 + (tc if coast else 0.0), dv=float("nan"))
    nF = np.abs(F / scale).max()
    msg, ok, it = "max iterations", False, 0
    for it in range(1, maxit + 1):
        if nF < ntol:
            ok, msg = True, "converged"
            break
        Js = J / scale[:, None] * pscale[None, :]
        try:
            dx = np.linalg.solve(Js, -F / scale)
        except np.linalg.LinAlgError:
            msg = "singular Jacobian"
            break
        lam0 = 1.0
        lam0 = min(lam0, 0.8 / max(np.abs(dx[:4]).max(), 1e-300))
        times = np.array([t1, t2] + ([tc] if coast else []))
        lam0 = min(lam0, 1.0 / max((np.abs(dx[4:]) * Tg / times).max(), 1e-300))
        accepted = False
        lam = lam0
        for _ in range(10):
            dxp = lam * dx * pscale
            n1 = e1 + dxp[0] * _basis(e1)[0] + dxp[1] * _basis(e1)[1]
            n2 = e2 + dxp[2] * _basis(e2)[0] + dxp[3] * _basis(e2)[1]
            nt1, nt2 = t1 + dxp[4], t2 + dxp[5]
            ntc = tc + dxp[6] if coast else 0.0
            if nt1 > 0 and nt2 > 0 and ntc >= 0:
                n1 /= np.linalg.norm(n1)
                n2 /= np.linalg.norm(n2)
                try:
                    Fn, Jn, _, _ = evaluate(n1, n2, nt1, nt2, ntc)
                except FloatingPointError:
                    Fn = None
                if Fn is not None and np.abs(Fn / scale).max() < nF * (1 - 1e-4 * lam):
                    accepted = True
                    break
            lam *= 0.5
        if not accepted:
            msg = "line search failed"
            break
        e1, e2, t1, t2, tc, F, J = n1, n2, nt1, nt2, ntc, Fn, Jn
        nF = np.abs(F / scale).max()
    else:
        if nF < ntol:
            ok, msg = True, "converged"
    if nF < ntol:
        ok, msg = True, "converged"
    elif msg == "line search failed" and nF < nfloor:      # Newton stalled at the Picard noise floor
        ok, msg = True, "converged (noise floor)"
    out = dict(ok=ok, msg=msg, iters=it, nfev=nfev, e1=e1, e2=e2, t1=t1, t2=t2, coast=tc if coast else 0.0,
               T=t1 + t2 + (tc if coast else 0.0), dv=acc * (t1 + t2) * AUD_MS, nF=nF)
    # final state: residuals in physical units, path, closest approach
    try:
        Fp, _, rec, _ = evaluate(e1, e2, t1, t2, tc, jac=False)
        out["resid_r"] = float(np.linalg.norm(Fp[:3])) * AU_KM
        out["resid_v"] = float(np.linalg.norm(Fp[3:6])) * AUD_MS
        if want_path:
            out["path"] = np.concatenate([np.column_stack([tn, R]) for (tn, R) in rec])
            out["rmin_sun"], out["t_rmin"] = _closest_sun(rec, M)
    except FloatingPointError:
        out["ok"], out["msg"] = False, "path propagation failed"
    return out


# ----------------------------------------------------------------------------- self-test
def _selftest():
    import os, sys, time
    sys.path.insert(0, os.environ.get("SOLAR_BACKEND", "<session-dir>/wt-c1/backend"))
    from data.bodies import ALL_BODIES
    BY = {b["id"]: b for b in ALL_BODIES}
    jd = 2461356.5

    # 1) gravity off, bodies at rest: T = 2 sqrt(d/a), dv = a T, to 1e-9
    rE, rM = body_fn(BY["earth"])(jd)[0], body_fn(BY["mars"])(jd)[0]
    for a_g in (0.01, 0.1, 1.0, 10.0):
        out = solve_trip(rest_fn(rE), rest_fn(rM), jd, a_g, mu=0.0, guess=naive_guess(rest_fn(rE), rest_fn(rM), jd, g_to_aud2(a_g)))
        a = g_to_aud2(a_g)
        d = np.linalg.norm(rM - rE)
        T_th = 2 * math.sqrt(d / a)
        assert out["ok"], out
        assert abs(out["T"] / T_th - 1) < 1e-9, (a_g, out["T"], T_th)
        assert abs(out["dv"] / (a * T_th * AUD_MS) - 1) < 1e-9
    print("free-space rest-to-rest: T=2 sqrt(d/a) and dv=a*T hold to 1e-9 at 0.01, 0.1, 1, 10 g")

    # 2) gravity on, earth->mars at 1 g, then check against a tight DOP853 re-integration
    from scipy.integrate import solve_ivp
    A, B = body_fn(BY["earth"]), body_fn(BY["mars"])
    t = time.perf_counter()
    out = solve_trip(A, B, jd, 1.0)
    dt = time.perf_counter() - t
    assert out["ok"], out
    a = g_to_aud2(1.0)
    rA, vA = A(jd)

    def rhs(t, y, e):
        r = y[:3]
        return np.concatenate([y[3:], -MU * r / np.linalg.norm(r) ** 3 + a * e])
    s1 = solve_ivp(rhs, (0, out["t1"]), np.concatenate([rA, vA]), args=(out["e1"],), method="DOP853", rtol=1e-12, atol=1e-14)
    s2 = solve_ivp(rhs, (0, out["t2"]), s1.y[:, -1], args=(out["e2"],), method="DOP853", rtol=1e-12, atol=1e-14)
    rB, vB = B(jd + out["T"])
    er = np.linalg.norm(s2.y[:3, -1] - rB) * AU_KM
    ev = np.linalg.norm(s2.y[3:, -1] - vB) * AUD_MS
    print(f"earth->mars 1 g: T={out['T']:.5f} d  t1={out['t1']:.5f}  t2={out['t2']:.5f}  dv={out['dv']/1e3:.1f} km/s  "
          f"rmin_sun={out['rmin_sun']:.4f} AU  iters={out['iters']}  {dt*1e3:.1f} ms")
    print(f"  DOP853 rtol=1e-12 re-integration: arrival error {er:.3g} km, {ev:.3g} m/s")
    assert er < 100 and ev < 1.0
    # 3) coast with a budget
    ob = solve_trip(A, B, jd, 1.0, dv_budget=0.5 * out["dv"], guess=dict(e1=out["e1"], e2=out["e2"], t1=out["t1"], t2=out["t2"]))
    print(f"  budget 0.5*dv: ok={ob['ok']}  T={ob['T']:.4f} d  coast={ob['coast']:.4f} d  dv={ob['dv']/1e3:.1f} km/s")
    print("self-test passed")


if __name__ == "__main__":
    _selftest()
