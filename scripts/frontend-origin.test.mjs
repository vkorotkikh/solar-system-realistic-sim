import { expect, it } from 'vitest';
import { buildFrontendEnv, buildFrontendArgs, parseDevFullConfig } from './dev-full-config.mjs';
it('forwards nondefault backend port to the consumed browser origin', () => {
  const config=parseDevFullConfig(['--backend-port','9342','--frontend-port','5179'],{});
  expect(buildFrontendEnv(config,{}).VITE_BACKEND_ORIGIN).toBe('http://127.0.0.1:9342');
  expect(buildFrontendArgs(config)).toContain('--strictPort');
});
it('supports explicit public HTTPS origins and IPv6 without guessing wildcard addresses', () => {
  expect(buildFrontendEnv(parseDevFullConfig(['--host','::1'],{}),{}).VITE_BACKEND_ORIGIN).toBe('http://[::1]:8042');
  const network=parseDevFullConfig(['--host','0.0.0.0'],{SOLAR_SECURITY_PROFILE:'network'});
  expect(()=>buildFrontendEnv(network,{})).toThrow(/VITE_BACKEND_ORIGIN/);
  expect(buildFrontendEnv(network,{VITE_BACKEND_ORIGIN:'https://solar.example:9443'}).VITE_BACKEND_ORIGIN).toBe('https://solar.example:9443');
});
