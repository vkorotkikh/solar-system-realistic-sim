"""Scientific validation epochs must never become dense-grid training inputs."""
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_catalog_moon_ephemeris as repair


def test_dense_grid_excludes_oracle_and_both_coverage_endpoints():
    epochs = [repair.START, repair.START+.125, repair.START+.25, repair.END]
    rows = tuple(repair.original.ElementRow(jd, .1, 1, 2, 3, 4, 5, 1000) for jd in epochs)
    reference = {'states': [{'jd_tdb': repair.START+.25}]}
    kept = repair.independent_training_rows(rows, reference)
    assert [row.jd for row in kept] == [2451545.125]
    assert len(rows) == 4


def test_candidate_missing_cache_fails_without_network(tmp_path):
    with patch.object(repair, 'urlopen', side_effect=AssertionError('network forbidden')):
        with pytest.raises(FileNotFoundError):
            repair.fetch_result({'COMMAND': '401'}, tmp_path, offline=True)


def test_truncated_candidate_grid_is_rejected(tmp_path):
    row = repair.original.ElementRow(repair.START, .1, 1, 2, 3, 4, 5, 1000)
    result = repair.original.QueryResult((row,), 1, 'SAT441L', 'test')
    with patch.object(repair, 'fetch_result', return_value='test-only'), patch.object(repair.original, '_parse_query', return_value=result):
        with pytest.raises(RuntimeError, match='grid'):
            repair.query_grid(repair.original.TARGETS[0], repair.START, repair.START+1, .5, tmp_path, True)
