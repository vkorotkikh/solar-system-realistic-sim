"""Regression TOOL-060: reject inline keys before work, preserve environment CLI.

Found by /qa on 2026-10-24; synthetic credentials and owned loopback only.
"""
from contextlib import contextmanager
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from urllib.error import URLError

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/openai_codex_prompt.py'
KEY = 'synthetic-tool060-environment-not-a-real-key-Q7'
INLINE = 'synthetic-tool060-inline-not-a-real-key-Z8'
MODEL = 'owned-model'


@pytest.fixture
def cli(monkeypatch):
    spec = importlib.util.spec_from_file_location('tool060_candidate', SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setenv('OPENAI_BASE_URL', 'http://127.0.0.1:1/v1')
    monkeypatch.setattr(sys, 'stdin', io.StringIO(''))

    def no_network(*args, **kwargs):
        raise AssertionError('unowned outbound request')

    monkeypatch.setattr(module.request, 'urlopen', no_network)
    return module


@contextmanager
def loopback_provider():
    state = SimpleNamespace(requests=[], response={'output_text': 'owned reply'},
                            status=200, raw_body=None,
                            models=['owned-model', 'gpt-5-mini', 'gpt-5.3-codex'])

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.respond()

        def do_POST(self):
            self.respond()

        def respond(self):
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length) if length else b''
            state.requests.append({'method': self.command, 'path': self.path,
                                   'authorization': self.headers.get('Authorization'),
                                   'payload': json.loads(raw) if raw else None})
            if self.path == '/v1/models':
                body = json.dumps({'data': [{'id': value} for value in state.models]}).encode()
            elif self.path == '/v1/responses':
                body = state.raw_body if state.raw_body is not None else json.dumps(state.response).encode()
            else:
                body = b'{"error":{"message":"unexpected owned path"}}'
            self.send_response(state.status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
    thread.start()
    state.url = f'http://127.0.0.1:{server.server_port}'
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        assert not thread.is_alive()


def public_cli(tmp_path, base_url, args, *, key=KEY, stdin=''):
    env = {'PATH': os.defpath, 'PYTHONDONTWRITEBYTECODE': '1',
           'OPENAI_BASE_URL': base_url, 'NO_PROXY': '127.0.0.1'}
    if key is not None:
        env['OPENAI_API_KEY'] = key
    result = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=tmp_path,
                            env=env, input=stdin, text=True, capture_output=True, timeout=5)
    assert list(tmp_path.iterdir()) == []
    return result


@pytest.mark.parametrize('inline', [
    ['--api-key', INLINE], ['--api-key=' + INLINE],
    ['--api-k', INLINE], ['--api-k=' + INLINE],
    ['--api-key', ''], ['--api-key='],
], ids=['split', 'equals', 'abbreviated-split', 'abbreviated-equals', 'empty-split', 'empty-equals'])
@pytest.mark.parametrize('environment_key', [False, True], ids=['without-env', 'with-env'])
def test_inline_key_rejected_before_api_work(cli, monkeypatch, capsys, inline, environment_key):
    calls = []
    if environment_key:
        monkeypatch.setenv('OPENAI_API_KEY', KEY)
    monkeypatch.setattr(cli, 'api_request', lambda *a, **k: calls.append((a, k)) or {'output_text': 'owned reply'})
    monkeypatch.setattr(sys, 'argv', [str(SCRIPT), '--model', MODEL, '--prompt', 'owned prompt', *inline])
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == 2
    output = capsys.readouterr()
    assert output.out == ''
    assert INLINE not in output.err and KEY not in output.err
    assert 'OPENAI_API_KEY' in output.err
    assert 'Inline API keys are not supported' in output.err
    assert calls == []


@pytest.mark.parametrize('environment_key', [False, True], ids=['without-env', 'with-env'])
def test_inline_key_without_value_remains_safe_parser_error(cli, monkeypatch, capsys, environment_key):
    if environment_key:
        monkeypatch.setenv('OPENAI_API_KEY', KEY)
    monkeypatch.setattr(sys, 'argv', [str(SCRIPT), '--api-key'])
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == 2
    assert KEY not in capsys.readouterr().err


@pytest.mark.parametrize('flag', ['--help', '-h'])
def test_public_help_advertises_only_environment_credentials(tmp_path, flag):
    result = public_cli(tmp_path, 'http://127.0.0.1:1', [flag], key=None)
    assert result.returncode == 0
    assert result.stderr == ''
    assert '--api-key' not in result.stdout
    assert 'OPENAI_API_KEY' in result.stdout
    assert '--prompt' in result.stdout and '--raw-json' in result.stdout


def test_missing_key_guidance_does_not_advertise_inline_input(tmp_path):
    result = public_cli(tmp_path, 'http://127.0.0.1:1', ['--model', MODEL, '--prompt', 'owned'], key=None)
    assert result.returncode == 2
    assert result.stdout == ''
    assert 'OPENAI_API_KEY' in result.stderr
    assert '--api-key' not in result.stderr


def test_public_inline_rejection_does_not_call_owned_provider(tmp_path):
    with loopback_provider() as provider:
        result = public_cli(tmp_path, provider.url, ['--model', MODEL, '--prompt', 'owned', '--api-key=' + INLINE])
        assert result.returncode == 2
        assert INLINE not in result.stderr and KEY not in result.stderr
        assert provider.requests == []


@pytest.mark.parametrize('args, stdin, expected_prompt, tokens', [
    (['hello', 'world', '--max-output-tokens', '17'], '', 'hello world', 17),
    (['--prompt', '  explicit text  '], '', 'explicit text', 800),
    ([], '  piped text\n', 'piped text', 800),
], ids=['positional', 'prompt-option', 'piped-stdin'])
def test_environment_key_success_preserves_auth_and_payload(tmp_path, args, stdin, expected_prompt, tokens):
    with loopback_provider() as provider:
        result = public_cli(tmp_path, provider.url, ['--model', MODEL, *args], stdin=stdin)
        assert result.returncode == 0
        assert result.stdout == 'owned reply\n'
        assert result.stderr == f'[model: {MODEL}]\n'
        assert KEY not in result.stdout + result.stderr
        assert provider.requests == [{'method': 'POST', 'path': '/v1/responses',
                                      'authorization': 'Bearer ' + KEY,
                                      'payload': {'model': MODEL, 'input': expected_prompt, 'max_output_tokens': tokens}}]


def test_automatic_model_selection_remains_unchanged(tmp_path):
    with loopback_provider() as provider:
        result = public_cli(tmp_path, provider.url, ['--prompt', 'owned'])
        assert result.returncode == 0
        assert result.stdout == 'owned reply\n'
        assert result.stderr == '[model: gpt-5.3-codex]\n'
        assert [(r['method'], r['path']) for r in provider.requests] == [('GET', '/v1/models'), ('POST', '/v1/responses')]
        assert provider.requests[1]['payload'] == {'model': 'gpt-5.3-codex', 'input': 'owned', 'max_output_tokens': 800}
        assert all(r['authorization'] == 'Bearer ' + KEY for r in provider.requests)


@pytest.mark.parametrize('all_models, expected', [
    (False, 'gpt-5-mini\ngpt-5.3-codex\n'),
    (True, 'gpt-5-mini\ngpt-5.3-codex\nowned-model\n'),
], ids=['filtered', 'all-models'])
def test_model_listing_still_uses_environment_auth(tmp_path, all_models, expected):
    with loopback_provider() as provider:
        result = public_cli(tmp_path, provider.url, ['--list-models', *(['--all-models'] if all_models else [])])
        assert result.returncode == 0 and result.stdout == expected and result.stderr == ''
        assert provider.requests == [{'method': 'GET', 'path': '/v1/models', 'authorization': 'Bearer ' + KEY, 'payload': None}]


def test_requested_response_content_is_not_blanket_redacted(tmp_path):
    with loopback_provider() as provider:
        provider.response = {'output_text': KEY, 'owned_metadata': KEY}
        result = public_cli(tmp_path, provider.url, ['--model', MODEL, '--prompt', 'owned', '--raw-json'])
        assert result.returncode == 0 and result.stdout == KEY + '\n'
        assert result.stderr.startswith(f'[model: {MODEL}]\n')
        assert json.loads(result.stderr.split('\n', 1)[1]) == provider.response


@pytest.mark.parametrize('raw_body, message', [
    (b'not-json', 'OpenAI API returned a non-JSON response.'),
    (b'[]', 'OpenAI API returned an unexpected JSON shape.'),
    (b'{}', 'Model returned no text output. Use --raw-json for details.'),
], ids=['non-json', 'wrong-shape', 'no-text'])
def test_existing_response_failures_remain_informative(tmp_path, raw_body, message):
    with loopback_provider() as provider:
        provider.raw_body = raw_body
        result = public_cli(tmp_path, provider.url, ['--model', MODEL, '--prompt', 'owned'])
        assert result.returncode == 1
        assert result.stdout == ''
        assert message in result.stderr
        assert KEY not in result.stderr
        assert len(provider.requests) == 1


def test_missing_prompt_rejects_before_request(tmp_path):
    with loopback_provider() as provider:
        result = public_cli(tmp_path, provider.url, ['--model', MODEL])
        assert result.returncode == 2
        assert 'Missing prompt' in result.stderr and KEY not in result.stderr
        assert provider.requests == []


# TOOL-060 Part2: exact active-key reflection in default error diagnostics only.
# Found by /qa on 2026-10-24; preserve Part1 fixtures and intentional output.
@pytest.mark.parametrize('kind,status', [('json', 401), ('plain', 500)])
@pytest.mark.parametrize('reflect', [False, True], ids=['no-secret-control', 'active-key-reflection'])
def test_actual_cli_http_diagnostics_redact_only_active_credential(tmp_path, kind, status, reflect):
    message = 'owned upstream failure'
    if reflect:
        message += f': {KEY}; repeated {KEY}'
    with loopback_provider() as provider:
        provider.status = status
        if kind == 'json':
            provider.response = {'error': {'message': message}}
        else:
            provider.raw_body = message.encode()
        result = public_cli(tmp_path, provider.url,
            ['--model', MODEL, '--prompt', 'owned diagnostic probe'])
        assert result.returncode == 1
        assert result.stdout == ''
        assert f'OpenAI API request failed ({status}): owned upstream failure' in result.stderr
        assert KEY not in result.stderr
        if not reflect:
            assert result.stderr == f'OpenAI API request failed ({status}): {message}\n'
        assert provider.requests == [{'method': 'POST', 'path': '/v1/responses',
            'authorization': 'Bearer ' + KEY,
            'payload': {'model': MODEL, 'input': 'owned diagnostic probe', 'max_output_tokens': 800}}]


@pytest.mark.parametrize('reflect', [False, True], ids=['no-secret-control', 'active-key-reflection'])
def test_outer_network_diagnostic_preserves_context_and_auth(monkeypatch, reflect):
    spec = importlib.util.spec_from_file_location('owned_tool060_network', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    reason = 'owned network failure' + (f': {KEY}; repeated {KEY}' if reflect else '')
    calls = []

    def rejected(req, timeout):
        calls.append((req.get_header('Authorization'), timeout))
        raise URLError(reason)

    monkeypatch.setattr(module.request, 'urlopen', rejected)
    with pytest.raises(RuntimeError) as caught:
        module.api_request('GET', 'http://127.0.0.1:1/v1/models', KEY)
    assert calls == [('Bearer ' + KEY, 120)]
    assert 'Network error while calling OpenAI API: owned network failure' in str(caught.value)
    assert KEY not in str(caught.value)
    if not reflect:
        assert str(caught.value) == 'Network error while calling OpenAI API: ' + reason


def test_empty_direct_credential_does_not_corrupt_network_diagnostic(monkeypatch):
    spec = importlib.util.spec_from_file_location('owned_tool060_empty', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def rejected(req, timeout):
        assert req.get_header('Authorization') == 'Bearer '
        raise URLError('owned network failure')

    monkeypatch.setattr(module.request, 'urlopen', rejected)
    with pytest.raises(RuntimeError, match='^Network error while calling OpenAI API: owned network failure$'):
        module.api_request('GET', 'http://127.0.0.1:1/v1/models', '')


def test_intentional_success_and_raw_response_content_are_unchanged(tmp_path):
    test_requested_response_content_is_not_blanket_redacted(tmp_path)
