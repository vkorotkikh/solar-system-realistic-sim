# Backend platform support

The Python backend requires POSIX process and signal semantics. The supported
validation platform is Linux, including a Linux distribution running under
WSL2. CI uses Ubuntu 24.04. Native Windows is unsupported; use WSL2 for the
backend on a Windows machine. This declaration is separate from the browser
frontend's browser compatibility tests.

Solar upstream requests and Horizons acquisition own subprocesses through one
deadline, including termination, reaping and release of their admission permits.
Those contracts depend on POSIX polling, signals and process ownership. A
successful Python import or a mocked transport test on another operating system
does not certify these contracts.

Other POSIX hosts, including macOS, are unverified. Before claiming support,
run the real child-process deadline, blocked-read, worker-death and capacity
recovery cases in the following suites on that host, with the pinned backend
test dependencies:

```bash
python -m pytest -q \
  backend/tests/test_solar_http_deadline.py \
  backend/tests/test_solar_http_high_fd.py \
  backend/tests/test_ephemeris_service_safety.py
```

Record the operating system, interpreter, exact source revision, collected
tests and skips with the result. A platform-specific skip leaves its associated
contract unverified. TLS, authentication, proxy trust and actual deployed
provider availability require separate deployment evidence.
