"""TOOL-104: the pinned test-client stack must import without deprecations."""
import json
import subprocess
import sys


def test_fastapi_test_client_imports_without_deprecation_warnings() -> None:
    # Starlette warns at import when it falls back from httpx2 to httpx, and
    # releases before 1.7.0 also touch AnyIO's deprecated BlockingPortal alias.
    probe = (
        "import json, warnings\n"
        "with warnings.catch_warnings(record=True) as caught:\n"
        "    warnings.simplefilter('always')\n"
        "    import fastapi.testclient\n"
        "print(json.dumps([str(w.message) for w in caught if w.category.__name__.endswith('DeprecationWarning')]))\n"
    )
    result = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout.splitlines()[-1]) == []
