"""Inspect NumPy's actual OpenBLAS runtime before exact catalog reconstruction."""
import argparse
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import sys


def file_identity(path):
    return {'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def inspect_library(path):
    result = file_identity(path)
    library = ctypes.CDLL(str(path))
    for field, stem, kind in [('actual_core', 'corename', ctypes.c_char_p),
                              ('configuration', 'config', ctypes.c_char_p),
                              ('actual_threads', 'num_threads', ctypes.c_int)]:
        names = [f'scipy_openblas_get_{stem}64_', f'openblas_get_{stem}64_', f'openblas_get_{stem}']
        function = next((getattr(library, name) for name in names if hasattr(library, name)), None)
        if function is None:
            raise RuntimeError(f'Cannot inspect OpenBLAS {field}')
        function.argtypes = []
        function.restype = kind
        value = function()
        result[field] = value.decode() if isinstance(value, bytes) else value
    return result


def math_runtime_identity():
    paths = sorted({line.split()[-1] for line in Path('/proc/self/maps').read_text().splitlines()
                    if any(token in line for token in ('/libm.so', '/libc.so', '/libpython', '/math.'))})
    executable = Path(sys.executable).resolve()
    result = {'executable': {**file_identity(executable), 'path': str(executable)},
              'math_origin': math.__spec__.origin,
              'math_binary': file_identity(Path(math.__file__)) if hasattr(math, '__file__')
                             else {'builtin_in_executable': True},
              'loaded_libraries': [{**file_identity(Path(path)), 'path': path} for path in paths]}
    # IFUNC addresses are process-specific; offsets identify the selected libm
    # implementation without confusing ASLR with different math dispatch.
    try:
        class DlInfo(ctypes.Structure):
            _fields_ = [('name', ctypes.c_char_p), ('base', ctypes.c_void_p),
                        ('symbol', ctypes.c_char_p), ('symbol_address', ctypes.c_void_p)]
        dladdr = ctypes.CDLL(None).dladdr
        dladdr.argtypes = [ctypes.c_void_p, ctypes.POINTER(DlInfo)]
        dladdr.restype = ctypes.c_int
        libm = ctypes.CDLL('libm.so.6')
        result['libm_functions'] = {}
        for name in ('sin', 'cos', 'atan2', 'sqrt'):
            info = DlInfo()
            pointer = ctypes.cast(getattr(libm, name), ctypes.c_void_p).value
            found = dladdr(ctypes.c_void_p(pointer), ctypes.byref(info))
            result['libm_functions'][name] = {
                'library': info.name.decode() if found and info.name else None,
                'offset': pointer - info.base if found and info.base else None,
                'symbol': info.symbol.decode() if found and info.symbol else None,
            }
    except Exception as error:
        result['libm_dispatch_error'] = f'{type(error).__name__}: {error}'
    return result


def capture_dione_probe(output):
    import numpy as np
    root = Path(__file__).resolve().parents[2]
    previous_path = sys.path[:]
    try:
        sys.path.insert(0, str(root / 'scripts'))
        import generate_moon_repairs as repairs
    finally:
        sys.path[:] = previous_path
    recipe = json.loads((repairs.INPUTS / 'manifest.json').read_bytes())['bodies']['dione']
    rows = repairs.read_rows(repairs.INPUTS, recipe['inputs']['source'])
    target = repairs.fit.original.Target(**recipe['target'])
    values = repairs.fit.features(rows, target.nominal_period_days)
    position, velocity = repairs.fit.state_from_features(values[:, 1:])
    arrays = {'source': np.asarray([list(row.__dict__.values()) for row in rows]),
              'features': values, 'position': position, 'velocity': velocity}
    original = np.linalg.lstsq
    calls = []

    def trace(a, b, *args, **kwargs):
        result = original(a, b, *args, **kwargs)
        if len(calls) < 2:
            label = f'lstsq_{len(calls)}'
            arrays[label + '_matrix'] = a.copy()
            arrays[label + '_rhs'] = b.copy()
            arrays[label + '_result'] = result[0].copy()
            calls.append({'label': label, 'rank': int(result[2]), 'rcond': kwargs.get('rcond')})
        return result

    span = np.nextafter((repairs.fit.END - repairs.fit.START) / recipe['segmentCount'], np.inf)
    np.linalg.lstsq = trace
    try:
        body = repairs.fit.fit_cartesian_model(target, rows, repairs.fit.END, float(span))
    finally:
        np.linalg.lstsq = original
    np.savez_compressed(output / 'dione-fit.npz', **arrays)
    record = {'body': 'dione', 'source_rows': recipe['inputs']['source']['rowsSha256'],
              'base': body['meanLongitudeBaseDeg'], 'rate': body['meanLongitudeRateDegPerDay'],
              'first_coefficient': body['segments'][0]['coefficients'][0][0], 'calls': calls,
              'arrays': {key: {'shape': list(array.shape),
                               'sha256': hashlib.sha256(array.tobytes()).hexdigest()}
                         for key, array in arrays.items()}}
    (output / 'dione-fit.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


def collect_profile():
    result = {'python': {'version': sys.version, 'compiler': platform.python_compiler()},
              'platform': {'system': platform.system(), 'machine': platform.machine(),
                           'libc': list(platform.libc_ver())},
              'environment': {key: os.environ.get(key) for key in (
                  'OPENBLAS_CORETYPE', 'OPENBLAS_NUM_THREADS', 'OPENBLAS_L2_SIZE', 'OMP_NUM_THREADS',
                  'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS', 'NPY_DISABLE_CPU_FEATURES', 'GLIBC_TUNABLES')},
              'openblas': [], 'inspection_errors': []}
    try:
        import numpy as np
        package = Path(np.__file__).resolve().parent
        result['numpy'] = {'version': np.__version__,
                           'enabled_simd': sorted(key for key, value in
                               np._core._multiarray_umath.__cpu_features__.items() if value),
                           'shared_modules': [file_identity(path) for path in sorted(package.rglob('*.so'))
                               if '_multiarray_umath' in path.name or '_umath_linalg' in path.name]}
        libraries = sorted((package.parent / 'numpy.libs').glob('*openblas*.so'))
        # Do not load arbitrary or ambiguous candidates when the wheel layout changes.
        if len(libraries) != 1:
            result['inspection_errors'].append('Expected exactly one NumPy bundled OpenBLAS library')
        else:
            result['openblas'].append(inspect_library(libraries[0]))
    except Exception as error:
        result['inspection_errors'].append(f'{type(error).__name__}: {error}')
    try:
        result['math_runtime'] = math_runtime_identity()
    except Exception as error:
        result['inspection_errors'].append(f'Math runtime identity: {type(error).__name__}: {error}')
    return result


def profile_errors(profile, required_core, required_l2_kib=None):
    errors = list(profile.get('inspection_errors', []))
    if required_l2_kib is not None:
        setting = profile.get('environment', {}).get('OPENBLAS_L2_SIZE')
        if setting != str(required_l2_kib):
            errors.append(f'Expected explicit OPENBLAS_L2_SIZE={required_l2_kib}; got {setting!r}')
    host = profile.get('platform', {})
    if host.get('system') != 'Linux' or host.get('machine') != 'x86_64':
        errors.append('Catalog numerical profile requires Linux x86-64')
    libraries = profile.get('openblas', [])
    if len(libraries) != 1:
        errors.append('Expected exactly one inspectable NumPy bundled OpenBLAS library')
        return errors
    library = libraries[0]
    if not library.get('actual_core') or (required_core and library['actual_core'] != required_core):
        errors.append(f'Expected actual OpenBLAS core {required_core!r}; got {library.get("actual_core")!r}')
    if type(library.get('actual_threads')) is not int or library['actual_threads'] != 1:
        errors.append(f'Expected exactly one thread; got {library.get("actual_threads")!r}')
    digest = library.get('sha256')
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        errors.append('OpenBLAS library SHA-256 is unavailable or invalid')
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-core', help='Require this actual selected OpenBLAS core and one thread')
    parser.add_argument('--require-l2-kib', type=int,
                        help='Require an explicit OPENBLAS_L2_SIZE environment setting in KiB')
    parser.add_argument('--probe-output', type=Path, help='Save read-only Dione fit diagnostics in this directory')
    args = parser.parse_args(argv)
    if args.require_l2_kib is not None and args.require_l2_kib <= 0:
        parser.error('--require-l2-kib must be positive')
    profile = collect_profile()
    errors = profile_errors(profile, args.require_core, args.require_l2_kib)
    profile.update(required_core=args.require_core, required_l2_kib=args.require_l2_kib,
                   profile_errors=errors)
    if args.probe_output is not None:
        try:
            args.probe_output.mkdir(parents=True, exist_ok=True)
            if not errors:
                profile['probe'] = capture_dione_probe(args.probe_output)
        except Exception as error:
            errors.append(f'Dione diagnostic: {type(error).__name__}: {error}')
        try:
            (args.probe_output / 'profile.json').write_text(json.dumps(profile, sort_keys=True, indent=2) + '\n')
        except OSError as error:
            errors.append(f'Cannot save diagnostic profile: {error}')
    print(json.dumps(profile, sort_keys=True, indent=2))
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
