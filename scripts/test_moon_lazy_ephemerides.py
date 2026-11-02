"""Lossless pinned input and fail-closed lazy-publication contracts."""
import importlib
from pathlib import Path
import sys
import numpy as np
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parent))


def implementation():
    try: return importlib.import_module('generate_moon_lazy_ephemerides')
    except ModuleNotFoundError: pytest.fail('Pinned lazy model generator is not implemented')


def test_replacing_a_content_addressed_generation_retires_obsolete_shards_atomically(tmp_path):
    from unittest.mock import patch
    import catalog_sources as sources
    output = tmp_path / 'shards'
    sources.publish_directory(output, {'old.json': b'old', 'manifest.json': b'old-index'})
    with patch.object(sources, '_exchange_directories', side_effect=OSError('exchange failed')):
        with pytest.raises(OSError):
            sources.publish_directory(output, {'new.json': b'new', 'manifest.json': b'new-index'}, preserve_existing=False)
    assert {p.name for p in output.iterdir()} == {'old.json', 'manifest.json'}
    sources.publish_directory(output, {'new.json': b'new', 'manifest.json': b'new-index'}, preserve_existing=False)
    assert {p.name for p in output.iterdir()} == {'new.json', 'manifest.json'}


def groups():
    return {'source':np.array([[2451545.125,-0.,1e-300,3.,4.,5.,6.,7.],
                               [2451549.125,.1,2.,3.,4.,5.,6.,7.]],dtype='<f8'),
            'held':np.array([[2451547.125,.1,2.,3.,4.,5.,6.,7.]],dtype='<f8'),
            'endpoints':np.array([[2451545.,.1,2.,3.,4.,5.,6.,7.],
                                  [2469807.5,.1,2.,3.,4.,5.,6.,7.]],dtype='<f8')}


def test_lossless_source_codec_preserves_all_float64_bits():
    module=implementation(); original=groups()
    actual=module.unpack_groups(module.pack_groups(original),{k:len(v) for k,v in original.items()})
    for key in original:
        np.testing.assert_array_equal(actual[key].view('<u8'),original[key].view('<u8'))


def test_source_codec_rejects_truncated_or_miscounted_archives():
    module=implementation(); original=groups(); packed=module.pack_groups(original)
    counts={k:len(v) for k,v in original.items()}
    with pytest.raises(ValueError): module.unpack_groups(packed[:-3],counts)
    with pytest.raises(ValueError): module.unpack_groups(packed,{**counts,'source':3})


def test_source_codec_rejects_nonfinite_provider_rows():
    module=implementation(); values=groups(); values['source'][0,1]=float('nan')
    with pytest.raises(ValueError): module.pack_groups(values)


def test_pinned_source_path_cannot_escape_its_input_directory(tmp_path):
    module=implementation()
    with pytest.raises(ValueError): module.read_recipe_inputs(tmp_path,{'input':{'file':'../escape'}})


def test_complete_manifest_and_existing_artifact_hashes():
    import json
    module = implementation()
    moons, oracle, base, artifacts, aliases = module.layout()
    manifest = json.loads((module.INPUTS / 'manifest.json').read_bytes())
    assert len(moons) == 423
    assert len(oracle['bodies']) == 424
    assert oracle['bodies']['378']['states'] == oracle['bodies']['388']['states']
    assert len(base) == 13
    assert len(aliases) == len(manifest['bodies']) == 410
    assert sum(len(rows) for rows in aliases.values()) == 410
    assert manifest['complete'] is True
    assert set(manifest['bodies']) == set(aliases)
    assert [row['id'] for row in aliases['puck']] == [388]
    assert len(artifacts) == 5


def test_all_lossless_source_archives_are_content_addressed_and_cover_each_record():
    import json
    module = implementation()
    manifest = json.loads((module.INPUTS / 'manifest.json').read_bytes())
    assert len(manifest['bodies']) == 410
    for recipe in manifest['bodies'].values():
        item = recipe['input']
        packed = (module.INPUTS / item['file']).read_bytes()
        assert module.sha(packed) == item['sha256'] == item['file'].removesuffix('.f64.xz')
        assert len(packed) == item['bytes']
        assert set(item['counts']) == set(module.PURPOSES)
        assert all(count > 0 for count in item['counts'].values())


def test_clean_checkout_offline_rebuild_of_all_410_shards(tmp_path, monkeypatch):
    """No candidate cache, network, generated oracle, or node_modules prerequisite.

    Hardlinks share immutable pinned bytes only; all code executes from the isolated
    checkout and fitting is repeated from every lossless source/held-out row.
    """
    import os
    from pathlib import Path
    import shutil
    import subprocess
    import sys
    module = implementation()
    root = module.fit.ROOT
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    for relative in ['scripts', 'src/data', 'backend/tests/fixtures', 'public/moon-ephemerides']:
        shutil.copytree(root / relative, checkout / relative, copy_function=os.link,
                        ignore=shutil.ignore_patterns('__pycache__', '.pytest_cache'))
    assert not (checkout / 'node_modules').exists()
    runner = '''
import runpy, socket, sys, urllib.request
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root / 'scripts'))
def forbidden(*args, **kwargs):
    raise AssertionError('clean-checkout rebuild forbids network')
socket.socket.connect = forbidden
socket.create_connection = forbidden
urllib.request.urlopen = forbidden
sys.argv = ['generate_moon_lazy_ephemerides.py', '--offline', '--check']
runpy.run_path(str(root / 'scripts/generate_moon_lazy_ephemerides.py'), run_name='__main__')
assert not (root / 'node_modules').exists()
'''
    env = {**os.environ, 'PYTHONHASHSEED': '0', 'OMP_NUM_THREADS': '1',
           'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1', 'NUMEXPR_NUM_THREADS': '1', 'TZ': 'UTC'}
    result = subprocess.run([sys.executable, '-c', runner], cwd=checkout, env=env,
                            capture_output=True, text=True, timeout=900)
    assert result.returncode == 0, result.stdout[-12000:] + result.stderr
    assert not (checkout / 'node_modules').exists()
    assert 'offlineByteIdentical' in result.stdout
