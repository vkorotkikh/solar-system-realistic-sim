"""SCN-045: independent ODE propagation, including rotated planes and boundary geometries."""
import math
import numpy as np
import pytest
from scipy.integrate import solve_ivp
from trajectory.lambert import solve_lambert_universal

MU=0.0002959122082855911
AU_KM=149597870.7


def propagate(start,velocity,tof):
    def rhs(t,y):
        return np.r_[y[3:],-MU*y[:3]/np.linalg.norm(y[:3])**3]
    state=solve_ivp(rhs,(0,tof),np.r_[start,velocity],method="DOP853",rtol=2e-13,atol=1e-14)
    assert state.success
    return state.y[:,-1]


@pytest.mark.parametrize("angle,tof", [(1e-8,100),(math.pi-1e-8,200),(math.pi+1e-8,200),(1.2,5)])
@pytest.mark.parametrize("prograde", [True,False])
def test_boundary_velocities_reach_both_endpoint_states(angle,tof,prograde):
    inclination=0.6
    start=np.array([1.,0.,0.])
    end=np.array([math.cos(angle),math.sin(angle)*math.cos(inclination),math.sin(angle)*math.sin(inclination)])
    if angle == 1e-8 and not prograde:
        # The long-way, nearly radial arc intersects the Sun. Cartesian ODE
        # integration through its singular focus is not a valid flight oracle.
        assert solve_lambert_universal(start,end,tof,prograde=False,tol_days=1e-10) is None
        return
    solution=solve_lambert_universal(start,end,tof,prograde=prograde,tol_days=1e-10,
                                     max_iter=400,min_periapsis_au=0)
    assert solution is not None
    state=propagate(start,solution["v1"],tof)
    assert np.linalg.norm(state[:3]-end)*AU_KM < 50
    assert np.linalg.norm(state[3:]-solution["v2"])*AU_KM/86400 < 1e-4
    h=np.cross(start,solution["v1"])
    assert (h[2]>0) == prograde


@pytest.mark.parametrize("revolutions", [1,2,3])
@pytest.mark.parametrize("branch", ["low","high"])
@pytest.mark.parametrize("prograde", [True,False])
def test_multiple_revolution_branches_propagate_independently(revolutions,branch,prograde):
    start=np.array([1.,0.,0.]); end=np.array([0.,1.1,0.])
    solution=solve_lambert_universal(start,end,1600,revolutions=revolutions,branch=branch,
        prograde=prograde,tol_days=1e-10,max_iter=400)
    assert solution is not None
    state=propagate(start,solution["v1"],1600)
    assert np.linalg.norm(state[:3]-end)*AU_KM < 1
    assert np.linalg.norm(state[3:]-solution["v2"])*AU_KM/86400 < 1e-5


@pytest.mark.parametrize("axis", [[1,0,0],[0,1,0],[0,0,1],[1,2,3]])
@pytest.mark.parametrize("sign", [-1,1])
@pytest.mark.parametrize("prograde", [True,False])
def test_exact_collinearity_never_selects_an_arbitrary_plane(axis,sign,prograde):
    assert solve_lambert_universal(axis,[sign*x for x in axis],200,prograde=prograde) is None
