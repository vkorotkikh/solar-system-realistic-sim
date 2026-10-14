interface BuildWebSocketUrlArgs {
  port?: number;
  params?: Record<string, string | number | boolean>;
}

type BuildWebSocketUrl = (args?: BuildWebSocketUrlArgs) => string;

interface ServerBodyState {
  pos: [number, number, number];
}

/** Current SimulationRunner payload; metadata is retained, not reinterpreted. */
export interface ServerKuiperSnapshot {
  positions: number[][];
  velocities?: number[][];
  binary_pairs?: [number, number][];
  position_units?: string;
  velocity_units?: string;
  binary_model?: string;
  [key: string]: unknown;
}

export interface ServerStateUpdateMessage {
  type: 'state_update';
  jd: number;
  jd_time_scale?: 'TDB' | string;
  bodies: Record<string, ServerBodyState>;
  kuiper?: ServerKuiperSnapshot | number[][] | null;
}

interface ConnectedMessage {
  type: 'connected';
  protocol_version?: number;
  jd_time_scale?: 'TDB' | string;
  warnings?: string[];
}

interface ErrorMessage {
  type: 'error';
  code?: string;
  message?: string;
}

type IncomingMessage = ServerStateUpdateMessage | ConnectedMessage | ErrorMessage;

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

interface ConnectOptions {
  backend?: 'rebound' | 'kepler' | string;
  port?: number;
}

export type SimulationClientStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stale' | 'offline';

export const WS_PROTOCOL_VERSION = 1;

const INITIAL_RECONNECT_DELAY_MS = 600;
const MAX_RECONNECT_DELAY_MS = 15_000;
const STALE_AFTER_MS = 4_000;
const RECONNECT_AFTER_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3
    && value.every(component => typeof component === 'number' && Number.isFinite(component));
}

function isKuiperPayload(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.every(isPosition); // Legacy positions-only wire format.
  if (!isRecord(value) || !Array.isArray(value.positions) || !value.positions.every(isPosition)) return false;
  const count = value.positions.length;
  if (value.velocities !== undefined && (!Array.isArray(value.velocities)
    || value.velocities.length !== count || !value.velocities.every(isPosition))) return false;
  if (value.binary_pairs !== undefined && (!Array.isArray(value.binary_pairs)
    || !value.binary_pairs.every(pair => Array.isArray(pair) && pair.length === 2
      && pair.every(index => Number.isInteger(index) && index >= 0 && index < count)
      && pair[0] !== pair[1]))) return false;
  // The renderer consumes AU positions. Velocities/physics labels are metadata,
  // not inputs to an implicit conversion or a claim of mutual binary gravity.
  return (value.position_units === undefined || value.position_units === 'AU')
    && (value.velocity_units === undefined || typeof value.velocity_units === 'string')
    && (value.binary_model === undefined || typeof value.binary_model === 'string');
}

function decodeMessage(data: string): IncomingMessage {
  const message: unknown = JSON.parse(data);
  if (!isRecord(message)) throw new Error('WebSocket message must be an object');
  if (message.type === 'state_update') {
    if (typeof message.jd !== 'number' || !Number.isFinite(message.jd)
      || !isRecord(message.bodies)
      || !Object.values(message.bodies).every(body => isRecord(body) && isPosition(body.pos))
      || (message.kuiper !== undefined && !isKuiperPayload(message.kuiper))) {
      throw new Error('Invalid WebSocket state_update: expected finite epoch and 3D positions');
    }
  } else if (message.type === 'connected') {
    // The v1 fields remain optional for legacy servers, but provided fields must
    // match the supported contract. Do not configure an incompatible session.
    if (message.protocol_version !== undefined && message.protocol_version !== WS_PROTOCOL_VERSION) {
      throw new Error(`WebSocket protocol version mismatch: client=${WS_PROTOCOL_VERSION}, server=${String(message.protocol_version)}`);
    }
    if (message.warnings !== undefined && (!Array.isArray(message.warnings)
      || !message.warnings.every(warning => typeof warning === 'string'))) {
      throw new Error('Invalid WebSocket connected warnings');
    }
  } else if (message.type === 'error') {
    if ((message.code !== undefined && typeof message.code !== 'string')
      || (message.message !== undefined && typeof message.message !== 'string')) {
      throw new Error('Invalid WebSocket error message');
    }
  } else {
    throw new Error('Unsupported WebSocket message type');
  }
  if (message.jd_time_scale !== undefined && message.jd_time_scale !== 'TDB') {
    throw new Error('Unsupported WebSocket epoch time scale: expected TDB');
  }
  return message as unknown as IncomingMessage;
}

export class SimulationClient {
  private readonly buildWebSocketUrl: BuildWebSocketUrl;

  private ws: WebSocket | null;

  private socketGeneration = 0;

  private connected: boolean;

  private reconnectTimerId: number | null;

  private staleTimerId: number | null;

  private reconnectAttempt: number;

  private manualDisconnect: boolean;

  private lastConnectOptions: ConnectOptions | null;

  private status: SimulationClientStatus;

  latestState: ServerStateUpdateMessage | null;

  latestKuiper: number[][] | null;

  latestKuiperSnapshot: ServerKuiperSnapshot | null = null;

  private kuiperActive: boolean;

  // Preserve legacy unsolicited snapshots until the caller explicitly revokes
  // the subscription. In-flight deliveries cannot undo that revocation.
  private kuiperRevoked = false;

  private kuiperRequest: { type: 'activate_kuiper'; center: number[]; spread: number } | null = null;

  private serverReady = false;

  lastError: string | null = null;

  onConnected: (() => void) | null;

  onDisconnected: (() => void) | null;

  onServerReady: ((client: SimulationClient) => void) | null;

  onStatusChange: ((status: SimulationClientStatus) => void) | null;

  onProtocolWarning: ((message: string) => void) | null;

  constructor({ buildWebSocketUrl }: { buildWebSocketUrl: BuildWebSocketUrl }) {
    this.buildWebSocketUrl = buildWebSocketUrl;
    this.ws = null;
    this.connected = false;
    this.reconnectTimerId = null;
    this.staleTimerId = null;
    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.lastConnectOptions = null;
    this.status = 'idle';
    this.latestState = null;
    this.latestKuiper = null;
    this.kuiperActive = false;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onServerReady = null;
    this.onStatusChange = null;
    this.onProtocolWarning = null;
  }

  getStatus(): SimulationClientStatus {
    return this.status;
  }

  connect(backend: 'rebound' | 'kepler' | string = 'rebound', port = 8042): void {
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.lastConnectOptions = { backend, port };
    this.clearReconnectTimer();
    this.openSocket({ backend, port }, false);
  }

  private openSocket(options: ConnectOptions, reconnecting: boolean): void {
    this.disconnectSocket();
    const generation = this.socketGeneration;
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting');
    if (generation !== this.socketGeneration || this.manualDisconnect) return;

    const backend = options.backend ?? 'rebound';
    const integrator = backend === 'rebound' ? 'ias15' : 'whfast';

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.buildWebSocketUrl({
        port: options.port ?? 8042,
        params: { engine: backend, integrator, protocol_version: WS_PROTOCOL_VERSION }
      }));
    } catch (error) {
      this.reportFailure(error instanceof Error ? error.message : String(error));
      if (generation === this.socketGeneration) this.scheduleReconnect();
      return;
    }
    this.ws = socket;
    this.staleTimerId = window.setTimeout(() => {
      if (this.ws !== socket) return;
      this.reportFailure('WebSocket connection timed out');
      if (this.ws === socket) this.handleSocketEnded();
    }, RECONNECT_AFTER_MS);

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.connected = true;
      this.armStaleTimer();
      this.notifyObserver(() => this.onConnected?.());
    };

    socket.onmessage = (event: MessageEvent) => {
      if (this.ws !== socket) return;
      if (typeof event.data !== 'string') return;
      let msg: IncomingMessage;
      try {
        msg = decodeMessage(event.data);
      } catch (error) {
        this.reportFailure(error instanceof Error ? error.message : String(error));
        return;
      }
      if (msg.type === 'error') {
        this.reportFailure(`${msg.code ?? 'server_error'}: ${msg.message ?? 'WebSocket server error'}`);
        return;
      }
      this.markFresh();
      if (this.ws !== socket) return;
      if (msg.type === 'state_update') {
        this.latestState = msg;
        // The backend emits Kuiper only every fifth frame. Omission preserves
        // the last complete snapshot, including velocities and binary metadata.
        if (!this.kuiperRevoked && msg.kuiper !== undefined) {
          this.latestKuiperSnapshot = Array.isArray(msg.kuiper) ? { positions: msg.kuiper } : msg.kuiper;
          this.latestKuiper = this.latestKuiperSnapshot?.positions ?? null;
        }
        return;
      }
      this.handleConnectedMessage(msg);
      if (this.ws !== socket) return;
      if (!this.serverReady) {
        this.serverReady = true;
        this.notifyObserver(() => this.onServerReady?.(this));
        if (this.ws === socket) this.replayKuiperRequest();
      }
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.handleSocketEnded();
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      this.reportFailure('WebSocket transport error');
      if (this.ws === socket) this.handleSocketEnded();
    };
  }

  private handleConnectedMessage(message: ConnectedMessage): void {
    const socket = this.ws;
    if (Array.isArray(message.warnings)) {
      for (const warning of message.warnings) {
        if (typeof warning === 'string' && this.onProtocolWarning) {
          this.notifyObserver(() => this.onProtocolWarning?.(warning));
          if (this.ws !== socket) return;
        }
      }
    }
  }

  private handleSocketEnded(): void {
    const hadSocket = this.ws !== null;
    this.disconnectSocket();
    const generation = this.socketGeneration;
    this.connected = false;
    this.latestState = null;

    if (!hadSocket) {
      return;
    }

    this.notifyObserver(() => this.onDisconnected?.());
    if (generation !== this.socketGeneration) return;

    if (this.manualDisconnect || !this.lastConnectOptions) {
      this.setStatus('offline');
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimerId !== null || !this.lastConnectOptions) return;

    this.reconnectAttempt += 1;
    const generation = this.socketGeneration;
    this.setStatus('reconnecting');
    if (generation !== this.socketGeneration || this.manualDisconnect) return;
    const baseDelayMs = Math.min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * (2 ** Math.max(0, this.reconnectAttempt - 1))
    );
    const jitteredDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, Math.round(baseDelayMs * (0.75 + Math.random() * 0.5)));

    this.reconnectTimerId = window.setTimeout(() => {
      if (generation !== this.socketGeneration) return;
      this.reconnectTimerId = null;
      if (this.manualDisconnect || !this.lastConnectOptions) {
        return;
      }
      this.openSocket(this.lastConnectOptions, true);
    }, jitteredDelayMs);
  }

  private markFresh(): void {
    this.lastError = null;
    this.reconnectAttempt = 0;
    // Install owned work before notifying observers; disconnect can then revoke it.
    this.armStaleTimer();
    if (this.connected) {
      this.setStatus('connected');
    }
  }

  private armStaleTimer(): void {
    const socket = this.ws;
    this.clearStaleTimer();
    this.staleTimerId = window.setTimeout(() => {
      if (this.ws === socket && this.connected) {
        this.latestState = null;
        this.latestKuiper = null;
        this.latestKuiperSnapshot = null;
        this.setStatus('stale');
        if (this.ws !== socket) return;
        this.staleTimerId = window.setTimeout(() => {
          if (this.ws !== socket) return;
          this.reportFailure('WebSocket valid-message timeout');
          if (this.ws === socket) this.handleSocketEnded();
        }, RECONNECT_AFTER_MS - STALE_AFTER_MS);
      }
    }, STALE_AFTER_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerId !== null) {
      window.clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  private clearStaleTimer(): void {
    if (this.staleTimerId !== null) {
      window.clearTimeout(this.staleTimerId);
      this.staleTimerId = null;
    }
  }

  private disconnectSocket(): void {
    this.socketGeneration++;
    this.clearStaleTimer();
    this.connected = false;
    this.serverReady = false;
    this.latestState = null;
    this.latestKuiper = null;
    this.latestKuiperSnapshot = null;
    this.kuiperActive = false;
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.close();
    this.ws = null;
  }

  private setStatus(status: SimulationClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.notifyObserver(() => this.onStatusChange?.(status));
  }

  private reportFailure(message: string): void {
    this.lastError = message;
    this.notifyObserver(() => this.onProtocolWarning?.(message));
  }

  private notifyObserver(notify: () => void): void {
    try {
      notify();
    } catch (error) {
      // UI observers cannot own transport cleanup, retry or subscription replay.
      // Do not recursively notify the possibly failing protocol-warning observer.
      try { console.warn('[simulationClient] observer failed:', error); } catch { /* Diagnostic only. */ }
    }
  }

  private replayKuiperRequest(): void {
    if (this.serverReady && this.kuiperRequest && !this.kuiperActive) {
      this.kuiperActive = this.send(this.kuiperRequest);
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.disconnectSocket();
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
    this.kuiperActive = false;
    this.kuiperRequest = null;
    this.setStatus('offline');
  }

  send(msg: Record<string, unknown>): boolean {
    const socket = this.ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(msg));
        return true;
      } catch (error) {
        this.reportFailure(error instanceof Error ? error.message : String(error));
        if (this.ws === socket) this.handleSocketEnded();
      }
    }
    return false;
  }

  activateKuiper(center: Vector3Like, spread: number): void {
    this.kuiperRevoked = false;
    this.kuiperRequest = { type: 'activate_kuiper', center: [center.x, center.y, center.z], spread };
    this.replayKuiperRequest();
  }

  deactivateKuiper(): void {
    this.kuiperRevoked = true;
    this.kuiperRequest = null;
    if (this.kuiperActive) {
      this.send({ type: 'deactivate_kuiper' });
      this.kuiperActive = false;
    }
    this.latestKuiper = null;
    this.latestKuiperSnapshot = null;
  }
}
