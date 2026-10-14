const DEFAULT_BACKEND_PORT = 8042;
const DEFAULT_FRONTEND_PORT = 5173;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_WS_COMMAND_MAX_BYTES = 16 * 1024;
const WS_COMMAND_MAX_BYTES_HARD_LIMIT = 16 * 1024;

function parsePort(raw, option) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${option} must be an integer between 1 and 65535`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${option} must be an integer between 1 and 65535`);
  }
  return value;
}

function boundedEnvironmentInteger(raw, defaultValue, minimum, maximum) {
  if (raw === undefined || !/^[+-]?\d+$/.test(String(raw))) return defaultValue;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return defaultValue;
  return Math.min(maximum, Math.max(minimum, value));
}

export function isCanonicalLoopbackHost(host) {
  const normalized = String(host).trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;

  const octets = normalized.split('.');
  if (octets.length !== 4) return false;
  if (!octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet))) return false;
  const numericOctets = octets.map(Number);
  return numericOctets.every((octet) => octet <= 255) && numericOctets[0] === 127;
}

export function parseDevFullConfig(argv, env = process.env) {
  const profile = String(env.SOLAR_SECURITY_PROFILE ?? 'local').trim().toLowerCase();
  if (!['local', 'network'].includes(profile)) {
    throw new Error('SOLAR_SECURITY_PROFILE must be either local or network');
  }

  const config = {
    backend: true,
    backendPort: DEFAULT_BACKEND_PORT,
    frontendPort: DEFAULT_FRONTEND_PORT,
    host: DEFAULT_HOST,
    open: false,
    help: false,
    securityProfile: profile,
    websocketMaxBytes: boundedEnvironmentInteger(
      env.WS_SIM_COMMAND_MAX_BYTES,
      DEFAULT_WS_COMMAND_MAX_BYTES,
      256,
      WS_COMMAND_MAX_BYTES_HARD_LIMIT,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      index += 1;
      const value = argv[index];
      if (value === undefined) throw new Error(`Missing value for ${argument}`);
      return value;
    };

    if (argument === '--help') config.help = true;
    else if (argument === '--no-backend') config.backend = false;
    else if (argument === '--backend-port') {
      config.backendPort = parsePort(next(), '--backend-port');
    } else if (argument === '--frontend-port') {
      config.frontendPort = parsePort(next(), '--frontend-port');
    } else if (argument === '--host') {
      config.host = next().trim();
      if (!config.host) throw new Error('--host cannot be empty');
    } else if (argument === '--open') config.open = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (
    !config.help
    && !isCanonicalLoopbackHost(config.host)
    && config.securityProfile !== 'network'
  ) {
    throw new Error(
      'Non-loopback --host requires SOLAR_SECURITY_PROFILE=network',
    );
  }
  return Object.freeze(config);
}

export function buildBackendArgs(config) {
  const args = [
    '-m', 'uvicorn', 'server:app',
    '--host', config.host,
    '--port', String(config.backendPort),
    '--ws-max-size', String(config.websocketMaxBytes),
    '--no-proxy-headers',
  ];
  if (config.securityProfile === 'local') args.push('--reload');
  return args;
}

export function buildFrontendArgs(config) {
  const args = [
    'vite',
    '--host', config.host,
    '--port', String(config.frontendPort),
    '--strictPort',
  ];
  if (config.open) args.push('--open');
  return args;
}

export function displayHost(host) {
  return host.includes(':') ? `[${host}]` : host;
}

export function buildFrontendEnv(config, env = process.env) {
  if (env.VITE_BACKEND_ORIGIN?.trim()) return { ...env };
  if (['0.0.0.0', '::', '[::]'].includes(config.host)) {
    throw new Error('Set VITE_BACKEND_ORIGIN to the browser-reachable HTTP(S) origin when binding a wildcard host');
  }
  return { ...env, VITE_BACKEND_ORIGIN: `http://${displayHost(config.host)}:${config.backendPort}` };
}
