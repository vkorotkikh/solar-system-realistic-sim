"""PLAN-014 selected direct-helper contract; actual module, no replacement solver.

Permanent direct-helper regression. References were independently computed from exact
binary64 inputs with mpmath 1.3.0 at 160/200 digits. Fraction comparisons require
no mpmath dependency and never round the returned value to the reference first.
The two catalog callers observe anomaly accuracy, not physical vector accuracy.
"""
import copy
from fractions import Fraction
import inspect
import math
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from data.bodies import ALL_BODIES
from mission import orbital

TARGET = Fraction.from_float(1e-10)
REFERENCE_UNCERTAINTY = Fraction('1e-50')
ORACLES = {
    'unwrapped1000': (1000.0, 0.99, '1000.934300251938276908831340345708520006088110434636870059318794700894'),
    'negative1000': (-1000.0, 0.99, '-1000.934300251938276908831340345708520006088110434636870059318794700894'),
    'aboveClamp': (0.1, 0.99999999, '0.8537501346553166743373881975867381123604036540177510459073415622368403'),
    'nearUnityTiny': (1e-20, 0.9999999999999999, '0.0000003909195815970804785308285687337035618252270151691985236751753947738267'),
    'nearWrappedEnd': (6.283185307179585, 0.9999999, '6.283185295848508678089873358390284798603383498683332305663712507295602'),
    'wrappedHigh': (0.1, 0.99, '0.8316604237910567594717853938464475681791516929359027048286284159424735'),
    'unrepresentableLarge': (1000000000.0, 0.99, '1000000000.989994255406893030323738846009344360656214063390538238406754'),
    'earth': (2.0812793153404527, 0.016711081495687886, '2.095740283633324092116255601938189669729514441429026013027836091792886'),
    'ceres': (4.554471797678043, 0.07957631989738838, '4.477088260815623788651032856784848156371674016430549583751748012176153'),
}


def assert_whole_anomaly(result, root_text):
    assert isinstance(result, (float, int)) and not isinstance(result, bool)
    assert math.isfinite(result)
    error = abs(Fraction(result) - Fraction(root_text))
    assert error + REFERENCE_UNCERTAINTY <= TARGET, (
        f'whole anomaly error {float(error):.17g} exceeds the selected 1e-10 target'
    )


def test_control_three_argument_api_keeps_default24_without_tolerance_knob():
    params = list(inspect.signature(orbital.solve_kepler).parameters.values())
    assert [param.name for param in params] == ['mean_anomaly_rad', 'eccentricity', 'max_iter']
    assert params[0].default is inspect.Parameter.empty
    assert params[1].default is inspect.Parameter.empty
    assert params[2].default == 24


def test_default_budget_never_returns_unchecked_unwrapped_iterate():
    mean, eccentricity, root = ORACLES['unwrapped1000']
    try:
        result = orbital.solve_kepler(mean, eccentricity)
    except RuntimeError:
        return  # Default24 need not solve every case, but must report exhaustion.
    assert_whole_anomaly(result, root)


@pytest.mark.parametrize('key', [
    'unwrapped1000', 'negative1000', 'aboveClamp', 'nearUnityTiny', 'nearWrappedEnd',
])
def test_representable_direct_cases_succeed_with_explicit_adequate_budget(key):
    mean, eccentricity, root = ORACLES[key]
    assert_whole_anomaly(orbital.solve_kepler(mean, eccentricity, 64), root)


def test_control_positive_python_integer_budget_has_no_new_arbitrary_cap():
    mean, eccentricity, root = ORACLES['wrappedHigh']
    assert_whole_anomaly(orbital.solve_kepler(mean, eccentricity, 10**100), root)


@pytest.mark.parametrize('body_id,elapsed_days', [('earth', 123.5), ('ceres', 137.25)])
def test_control_actual_normalized_catalog_caller_retains_default24(monkeypatch, body_id, elapsed_days):
    actual = orbital.solve_kepler
    calls = []

    def observe(*args, **kwargs):
        result = actual(*args, **kwargs)
        calls.append((args, kwargs, result))
        return result

    monkeypatch.setattr(orbital, 'solve_kepler', observe)
    body = next(item for item in ALL_BODIES if item['id'] == body_id)
    before = copy.deepcopy(body)
    state = orbital.sample_body_state_from_elements(body, body['orbit']['epoch_jd'] + elapsed_days)
    assert body == before
    assert len(calls) == 1
    args, kwargs, result = calls[0]
    mean, eccentricity, root = ORACLES[body_id]
    assert args == (mean, eccentricity) and kwargs == {}
    assert inspect.signature(actual).parameters['max_iter'].default == 24
    assert 0 <= mean < 2 * math.pi
    assert_whole_anomaly(result, root)
    assert set(state) == {'position', 'velocity'}
    assert all(len(vector) == 3 and all(math.isfinite(value) for value in vector)
               for vector in state.values())


def test_circular_identities_are_exact_including_signed_zero_and_large_turns():
    for mean in [0, 0.0, -0.0, 1.2, -1.2, 1e20, -1e20]:
        result = orbital.solve_kepler(mean, 0, 1)
        assert result == mean
        assert math.copysign(1.0, result) == math.copysign(1.0, mean)


@pytest.mark.parametrize('mean', [0.0, -0.0], ids=['positive_zero', 'negative_zero'])
def test_zero_anomaly_is_exact_with_high_e_after_validation(mean):
    result = orbital.solve_kepler(mean, 0.9999999999999999, 1)
    assert result == mean
    assert math.copysign(1.0, result) == math.copysign(1.0, mean)


def test_control_large_non_circular_small_e_is_not_rejected_by_ulp_alone():
    # |E-M| = |e*sin(E)| <= e < 1e-10; M itself is an adequate binary64 result.
    mean, eccentricity = 1e9, 1e-12
    assert Fraction.from_float(eccentricity) < TARGET
    assert math.ulp(mean) > float(TARGET)
    assert orbital.solve_kepler(mean, eccentricity) == mean


@pytest.mark.parametrize('budget', [24, 64])
def test_unrepresentable_whole_anomaly_precision_raises_runtime_error(budget):
    mean, eccentricity, root_text = ORACLES['unrepresentableLarge']
    nearest = float(root_text)
    adjacent = [math.nextafter(nearest, -math.inf), nearest, math.nextafter(nearest, math.inf)]
    closest_error = min(abs(Fraction(value) - Fraction(root_text)) for value in adjacent)
    assert closest_error - REFERENCE_UNCERTAINTY > TARGET
    with pytest.raises(RuntimeError):
        orbital.solve_kepler(mean, eccentricity, budget)


def test_explicit_one_iteration_budget_reports_exhaustion():
    with pytest.raises(RuntimeError):
        orbital.solve_kepler(0.1, 0.99, 1)


INVALID_ARGUMENT_GROUPS = {
    'mean_before_circular_identity': [
        (value, 0.0, 24) for value in [math.nan, math.inf, -math.inf, True, False, '0', None, 1j]
    ],
    'eccentricity_before_zero_identity': [
        (0.0, value, 24) for value in [-0.1, 1.0, 1.2, math.nan, math.inf, True, False, '0', None, 1j]
    ],
    'budget_before_circular_identity': [
        (0.0, 0.0, value) for value in [0, -1, 1.5, 1.0, math.nan, math.inf, True, False, '24', None]
    ],
}


@pytest.mark.parametrize('group', list(INVALID_ARGUMENT_GROUPS))
def test_invalid_arguments_raise_value_error_before_identity_shortcuts(group):
    unexpected = []
    for args in INVALID_ARGUMENT_GROUPS[group]:
        try:
            result = orbital.solve_kepler(*args)
        except ValueError:
            continue
        except Exception as error:
            unexpected.append((repr(args), type(error).__name__))
        else:
            unexpected.append((repr(args), f'returned {result!r}'))
    assert unexpected == []


# Python Real-domain clarification: never solve a silently rounded equation.
def test_original_real_identities_and_analytic_bound_do_not_require_float_conversion():
    for mean, eccentricity in [
        (10**400, 0),
        (Fraction(1, 3), 0),
        (0, Fraction(1, 3)),
        (10**400, Fraction(1, 10**12)),
    ]:
        result = orbital.solve_kepler(mean, eccentricity, 1)
        assert result == mean
        assert type(result) is type(mean)


def test_lossless_real_conversion_retains_the_original_equation():
    mean, eccentricity, root = ORACLES['wrappedHigh']
    assert_whole_anomaly(orbital.solve_kepler(
        Fraction.from_float(mean), Fraction.from_float(eccentricity), 64,
    ), root)


@pytest.mark.parametrize('mean,eccentricity', [
    (Fraction(1, 3), Fraction(1, 2)),
    (2**53 + 1, 0.99),
    (10**400, 0.5),
    (0.1, Fraction(1, 3)),
    (0.1, Fraction(2**54 - 1, 2**54)),
])
def test_valid_but_nonlossless_real_arguments_report_unestablishable_precision(mean, eccentricity):
    with pytest.raises(RuntimeError):
        orbital.solve_kepler(mean, eccentricity, 64)


def test_original_domain_and_budget_validation_precede_large_exact_identities():
    for arguments in [(10**400, -0.1, 24), (10**400, 0, 0), (0, Fraction(-1, 3), 24)]:
        with pytest.raises(ValueError):
            orbital.solve_kepler(*arguments)


def test_unrepresentable_result_with_huge_valid_budget_settles_in_owned_child():
    import json
    import subprocess

    # The fixed target is unachievable by the independent neighboring-float
    # oracle above. A huge budget must not conceal representable stagnation.
    # subprocess.run kills and waits for this owned child on safety timeout.
    program = (
        'import json, sys\n'
        f'sys.path.insert(0, {str(ROOT / "backend")!r})\n'
        'from mission.orbital import solve_kepler\n'
        'try:\n'
        '    value = solve_kepler(1e9, .99, 10**100)\n'
        'except Exception as error:\n'
        '    print(json.dumps({"error": type(error).__name__}))\n'
        'else:\n'
        '    print(json.dumps({"returned": value}))\n'
    )
    child = subprocess.run([sys.executable, '-c', program], cwd=ROOT,
                           capture_output=True, text=True, timeout=3, check=False)
    assert child.returncode == 0
    assert child.stderr == ''
    assert json.loads(child.stdout) == {'error': 'RuntimeError'}
