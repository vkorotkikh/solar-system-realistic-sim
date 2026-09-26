import { describe, expect, it } from 'vitest';

import {
  buildBackendArgs,
  isCanonicalLoopbackHost,
  parseDevFullConfig,
} from './dev-full-config.mjs';

describe('dev-full security boundary', () => {
  it('defaults both development servers to loopback', () => {
    const config = parseDevFullConfig([], {});

    expect(config.host).toBe('127.0.0.1');
    expect(config.backend).toBe(true);
  });

  it.each([
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '127.42.8.9',
    '::1',
  ])('accepts canonical loopback host %s in the local profile', (host) => {
    expect(isCanonicalLoopbackHost(host)).toBe(true);
    expect(parseDevFullConfig(['--host', host], {}).host).toBe(host);
  });

  it.each([
    '0.0.0.0',
    '192.168.1.10',
    'localhost.example',
    '127.1',
    '0177.0.0.1',
    '::ffff:127.0.0.1',
  ])('rejects non-canonical or non-loopback host %s in local mode', (host) => {
    expect(isCanonicalLoopbackHost(host)).toBe(false);
    expect(() => parseDevFullConfig(['--host', host], {})).toThrow(
      /SOLAR_SECURITY_PROFILE=network/,
    );
  });

  it('allows explicit network exposure only under the network profile', () => {
    const config = parseDevFullConfig(
      ['--host', '0.0.0.0'],
      { SOLAR_SECURITY_PROFILE: 'network' },
    );

    expect(config.host).toBe('0.0.0.0');
  });

  it('always disables Uvicorn proxy-header rewriting', () => {
    const args = buildBackendArgs(parseDevFullConfig([], {}));

    expect(args).toContain('--no-proxy-headers');
    expect(args).not.toContain('--proxy-headers');
    expect(args).toContain('--reload');

    const networkArgs = buildBackendArgs(parseDevFullConfig(
      ['--host', '0.0.0.0'],
      { SOLAR_SECURITY_PROFILE: 'network' },
    ));
    expect(networkArgs).not.toContain('--reload');
  });
});
