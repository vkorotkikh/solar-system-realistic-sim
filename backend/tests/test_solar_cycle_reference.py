"""The same independent analytic fixture gates both active cycle implementations."""
import json
from pathlib import Path

import pytest

from sim.solar_physics import _hathaway_normalized, _hathaway_peak_months

REFERENCE = json.loads((Path(__file__).parent / 'fixtures/solar_hathaway.json').read_text())


@pytest.mark.parametrize('shape', REFERENCE['shapes'])
def test_hathaway_matches_shared_analytic_oracle(shape):
    assert _hathaway_peak_months(shape['b'], shape['c']) == pytest.approx(shape['peak_months'], abs=1e-12)
    assert _hathaway_normalized(shape['peak_months'], shape['b'], shape['c']) == pytest.approx(1, abs=1e-14)
    for month, expected in zip(REFERENCE['months'], shape['values']):
        assert _hathaway_normalized(month, shape['b'], shape['c']) == pytest.approx(expected, abs=2e-14)
