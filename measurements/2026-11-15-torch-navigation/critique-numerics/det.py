"""Seven-unknown keep-out detour inside the Chebyshev-Picard collocation solver (critique prototype).

unknowns p = [e1 (2 tangent coords), e2 (2), t1, t2, phi];  residual = [r_end - rB, v_end - vB, rmin - R_keep]
thrust  u = cos(phi) e + sgn sin(phi) n,  e = e1 before the flip (t < t1) and e2 after, n = unit part of `ref`
orthogonal to e, sgn = +1 on [0, T/4], -1 on [T/4, 3T/4], +1 on [3T/4, T].  Forward-difference Jacobian, real arithmetic,
rmin evaluated for every Jacobian row (envelope-free: each row finds its own closest point).
"""
from clab import *
import tr
from tr import _ops, _basis, C

_IF = {}


def rows_rmin(rec_all, M, iters=30):
    """closest distance to the Sun (AU) for every batch row from the recorded collocation segments."""
    tau, _, Vi = _ops(M)
    if M not in _IF:
        _IF[M] = C.chebvander(np.linspace(-1, 1, 81), M) @ Vi
    If = _IF[M]
    xf = np.linspace(-1, 1, 81)
    n = rec_all[0].shape[0]
    ar = np.arange(n)
    best = np.full(n, 1e99); bk = np.zeros(n, int); bi = np.zeros(n, int)
    for k, Rk in enumerate(rec_all):
        rf = np.einsum("pm,nmc->npc", If, Rk)
        d = np.sqrt((rf * rf).sum(-1))
        i = d.argmin(1)
        dm = d[ar, i]
        u = dm < best
        best[u] = dm[u]; bk[u] = k; bi[u] = i[u]
    coef = np.stack([Vi @ rec_all[bk[j]][j] for j in range(n)])           # (n, M+1, 3)
    lo = xf[np.maximum(bi - 1, 0)]; hi = xf[np.minimum(bi + 1, 80)]

    def dist(x):
        V = C.chebvander(x, M)                                              # (n, M+1)
        p = np.einsum("nm,nmc->nc", V, coef)
        return np.sqrt((p * p).sum(-1))
    for _ in range(iters):
        m1 = lo + (hi - lo) / 3; m2 = hi - (hi - lo) / 3
        c = dist(m1) < dist(m2)
        hi = np.where(c, m2, hi); lo = np.where(c, lo, m1)
    return dist(0.5 * (lo + hi)), bk


def _perp(ref, e):
    n = ref[None, :] - (e @ ref)[:, None] * e if e.ndim == 2 else ref - (e @ ref) * e
    return n / np.linalg.norm(n, axis=-1, keepdims=True) if n.ndim == 2 else n / np.linalg.norm(n)


def solve_detour(Afun, Bfun, t0, a_g, R_keep, base, ref, phi0=0.2, mu=MU, M=12, phi_max=1.0, ptol=1e-11, ntol=1e-9,
                 maxit=40, fdh=1e-7, jacobian="fd", rmin_mode="row", verbose=False, signs=(1, -1, 1), return_eval=False):
    """base: dict(e1,e2,t1,t2) from the 6-unknown solve.  ref: lateral reference vector.  Returns dict."""
    acc = g_to_aud2(a_g)
    rA, vA = Afun(t0)
    e1, e2 = np.array(base["e1"], float), np.array(base["e2"], float)
    t1, t2, phi = float(base["t1"]), float(base["t2"]), float(phi0)
    Tg = t1 + t2
    d0 = max(np.linalg.norm(Bfun(t0 + Tg)[0] - rA), 1e-3)
    Lr, Lv = d0, max(acc * Tg, 1e-6)
    scale = np.array([Lr] * 3 + [Lv] * 3 + [Lr])
    pscale = np.array([1.0] * 4 + [Tg] * 2 + [1.0])
    hs = np.array([fdh] * 4 + [fdh * Tg] * 2 + [fdh])
    npar = 7
    nfev = [0]

    def evaluate(e1, e2, t1, t2, phi, jac=True):
        nfev[0] += 1
        n = npar + 1 if jac else 1
        X = np.zeros((n, npar))
        if jac:
            X[1 + np.arange(npar), np.arange(npar)] = hs
        b11, b12 = _basis(e1); b21, b22 = _basis(e2)
        E1 = e1 + X[:, 0:1] * b11 + X[:, 1:2] * b12
        E2 = e2 + X[:, 2:3] * b21 + X[:, 3:4] * b22
        E1 /= np.linalg.norm(E1, axis=1, keepdims=True); E2 /= np.linalg.norm(E2, axis=1, keepdims=True)
        T1 = t1 + X[:, 4]; T2 = t2 + X[:, 5]; PH = phi + X[:, 6]
        TT = T1 + T2
        N1 = _perp(ref, E1); N2 = _perp(ref, E2)
        cuts = {"0": 0 * TT, "q1": 0.25 * TT, "f": T1, "q3": 0.75 * TT, "T": TT}
        order = sorted(cuts, key=lambda k: float(cuts[k][0]))
        sg1, sg2, sg3 = signs
        r = np.tile(rA, (n, 1)); v = np.tile(vA, (n, 1))
        rec = None
        rec_all = []
        t_off = 0.0
        for a, b in zip(order[:-1], order[1:]):
            dur = cuts[b] - cuts[a]
            mid = 0.5 * (float(cuts[a][0]) + float(cuts[b][0]))
            if float(dur[0]) < 1e-12:
                continue
            first = mid < float(T1[0])
            sg = sg1 if mid < 0.25 * float(TT[0]) else (sg3 if mid > 0.75 * float(TT[0]) else sg2)
            E, N = (E1, N1) if first else (E2, N2)
            u = np.cos(PH)[:, None] * E + sg * np.sin(PH)[:, None] * N
            r, v = tr.propagate_arc(r, v, acc * u, dur, mu, M, phi_max, ptol, rec=rec, t_off=t_off, rec_all=rec_all)
            t_off += float(dur[0])
        rB, vB = Bfun(t0 + TT[0])
        rm, _ = rows_rmin(rec_all, M)
        F = np.concatenate([r[0] - rB, v[0] - vB, [rm[0] - R_keep]])
        J = None
        if jac:
            J = np.zeros((7, npar))
            for i in range(1, n):
                rBi, vBi = Bfun(t0 + TT[i])
                Fi = np.concatenate([r[i] - rBi, v[i] - vBi, [rm[i] - R_keep]])
                J[:, i - 1] = (Fi - F) / hs[i - 1]
        return F, J, rec, rm[0]

    if return_eval:
        return evaluate
    t_start = time.perf_counter()
    try:
        F, J, _, rm = evaluate(e1, e2, t1, t2, phi)
    except FloatingPointError:
        return dict(ok=False, msg="Picard failed at start", iters=0, nfev=nfev[0])
    nF = np.abs(F / scale).max()
    msg, ok, it = "max iterations", False, 0
    hist = [(float(nF), float(rm))]
    for it in range(1, maxit + 1):
        if nF < ntol:
            ok, msg = True, "converged"; break
        Js = J / scale[:, None] * pscale[None, :]
        try:
            dx = np.linalg.solve(Js, -F / scale)
        except np.linalg.LinAlgError:
            msg = "singular Jacobian"; break
        lam = min(1.0, 0.8 / max(np.abs(dx[:4]).max(), 1e-300))
        times = np.array([t1, t2])
        lam = min(lam, 1.0 / max((np.abs(dx[4:6]) * Tg / times).max(), 1e-300))
        lam = min(lam, 0.3 / max(abs(dx[6]), 1e-300))
        accepted = False
        for _ in range(12):
            dxp = lam * dx * pscale
            n1 = e1 + dxp[0] * _basis(e1)[0] + dxp[1] * _basis(e1)[1]
            n2 = e2 + dxp[2] * _basis(e2)[0] + dxp[3] * _basis(e2)[1]
            nt1, nt2, nph = t1 + dxp[4], t2 + dxp[5], phi + dxp[6]
            if nt1 > 0 and nt2 > 0:
                n1 /= np.linalg.norm(n1); n2 /= np.linalg.norm(n2)
                try:
                    Fn, Jn, _, rmn = evaluate(n1, n2, nt1, nt2, nph)
                except FloatingPointError:
                    Fn = None
                if Fn is not None and np.abs(Fn / scale).max() < nF * (1 - 1e-4 * lam):
                    accepted = True; break
            lam *= 0.5
        if not accepted:
            msg = "line search failed"; break
        e1, e2, t1, t2, phi, F, J, rm = n1, n2, nt1, nt2, nph, Fn, Jn, rmn
        nF = np.abs(F / scale).max()
        hist.append((float(nF), float(rm)))
        if verbose:
            print(it, nF, rm, phi, t1 + t2)
    if nF < ntol:
        ok, msg = True, "converged"
    return dict(ok=ok, msg=msg, iters=it, nfev=nfev[0], e1=e1, e2=e2, t1=t1, t2=t2, phi=phi, T=t1 + t2, nF=float(nF),
                rmin=float(rm), hist=hist, ms=(time.perf_counter() - t_start) * 1e3, ref=ref, signs=signs)


def detour_dop(out, Afun, Bfun, t0, a_g, mu=MU, nd=4001):
    """independent check: DOP853 re-integration of the 4-arc thrust program; arrival error and dense-sampled min |r|"""
    from scipy.integrate import solve_ivp
    acc = g_to_aud2(a_g)
    e1, e2, t1, t2, phi, ref = out["e1"], out["e2"], out["t1"], out["t2"], out["phi"], out["ref"]
    T = t1 + t2
    n1 = _perp(ref, e1); n2 = _perp(ref, e2)
    cuts = sorted({0.0, 0.25 * T, t1, 0.75 * T, T})
    rA, vA = Afun(t0)
    y = np.concatenate([rA, vA]); rmin = 1e9
    sg1, sg2, sg3 = out.get("signs", (1, -1, 1))
    for lo, hi in zip(cuts[:-1], cuts[1:]):
        if hi - lo < 1e-12:
            continue
        mid = 0.5 * (lo + hi)
        e, nn = (e1, n1) if mid < t1 else (e2, n2)
        sg = sg1 if mid < 0.25 * T else (sg3 if mid > 0.75 * T else sg2)
        u = math.cos(phi) * e + sg * math.sin(phi) * nn

        def rhs(t, y, u=u):
            r = y[:3]
            return np.concatenate([y[3:], -mu * r / np.linalg.norm(r) ** 3 + acc * u])
        s = solve_ivp(rhs, (0, hi - lo), y, method="DOP853", rtol=1e-12, atol=1e-14, dense_output=True)
        tt = np.linspace(0, hi - lo, nd)
        rmin = min(rmin, float(np.linalg.norm(s.sol(tt)[:3], axis=0).min()))
        y = s.y[:, -1]
    rB, vB = Bfun(t0 + T)
    return dict(err_km=float(np.linalg.norm(y[:3] - rB) * AU_KM), err_ms=float(np.linalg.norm(y[3:] - vB) * AUD_MS), min_dense=rmin)


def away_ref(base_out, Afun=None):
    """Sun -> closest point vector of the unconstrained solved path (same as course_reference 'away_dynamic')."""
    p = base_out["path"]
    d = np.linalg.norm(p[:, 1:4], axis=1)
    i = int(d.argmin())
    v = p[i, 1:4]
    return v / np.linalg.norm(v) if d[i] > 1e-3 else np.array([0, 0, 1.0])
