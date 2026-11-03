"""Inspect NumPy's actual OpenBLAS runtime before exact catalog reconstruction."""
import argparse
import ctypes
import hashlib
import json
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


def collect_profile():
    result = {'python': {'version': sys.version, 'compiler': platform.python_compiler()},
              'platform': {'system': platform.system(), 'machine': platform.machine(),
                           'libc': list(platform.libc_ver())},
              'environment': {key: os.environ.get(key) for key in (
                  'OPENBLAS_CORETYPE', 'OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS',
                  'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS', 'NPY_DISABLE_CPU_FEATURES')},
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
    return result


def profile_errors(profile, required_core):
    errors = list(profile.get('inspection_errors', []))
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
    args = parser.parse_args(argv)
    profile = collect_profile()
    errors = profile_errors(profile, args.require_core)
    profile.update(required_core=args.require_core, profile_errors=errors)
    print(json.dumps(profile, sort_keys=True, indent=2))
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
