interface BuildWebSocketUrlArgs {
  port?: number;
  params?: Record<string, string | number | boolean>;
}

type BuildWebSocketUrl = (args?: BuildWebSocketUrlArgs) => string;

interface ServerBodyState {
  pos: [number, number, number];
}

export interface ServerStateUpdateMessage {
  type: 'state_update';
  jd: number;
  bodies: Record<string, ServerBodyState>;
  kuiper?: number[][];
}

interface ConnectedMessage {
  type: 'connected';
  protocol_version?: number;
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

export class SimulationClient {
  private readonly buildWebSocketUrl: BuildWebSocketUrl;

  private ws: WebSocket | null;

  private connected: boolean;

  private reconnectTimerId: number | null;

  private staleTimerId: number | null;

  private reconnectAttempt: number;

  private manualDisconnect: boolean;

  private lastConnectOptions: ConnectOptions | null;

  private status: SimulationClientStatus;

  latestState: ServerStateUpdateMessage | null;

  latestKuiper: number[][] | null;

  private kuiperActive: boolean;

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
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting');

    const backend = options.backend ?? 'rebound';
    const integrator = backend === 'rebound' ? 'ias15' : 'whfast';

    this.ws = new WebSocket(this.buildWebSocketUrl({
      port: options.port ?? 8042,
      params: {
        engine: backend,
        integrator,
        protocol_version: WS_PROTOCOL_VERSION
      }
    }));

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.markFresh();
      if (this.onConnected) this.onConnected();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      this.markFresh();

      try {
        const msg = JSON.parse(event.data) as IncomingMessage;
        if (msg.type === 'state_update') {
          this.latestState = msg;
          if (msg.kuiper) {
            this.latestKuiper = msg.kuiper;
          }
          return;
        }

        if (msg.type === 'connected') {
          this.handleConnectedMessage(msg);
          if (this.onServerReady) this.onServerReady(this);
        }
      } catch {
        // Ignore parse errors so one malformed payload does not kill the session.
      }
    };

    this.ws.onclose = () => {
      this.handleSocketEnded();
    };

    this.ws.onerror = () => {
      this.handleSocketEnded();
    };
  }

  private handleConnectedMessage(message: ConnectedMessage): void {
    const negotiatedVersion = Number(message.protocol_version);
    if (Number.isFinite(negotiatedVersion) && negotiatedVersion !== WS_PROTOCOL_VERSION) {
      const warning = (
        `WebSocket protocol version mismatch: client=${WS_PROTOCOL_VERSION}, `
        + `server=${negotiatedVersion}`
      );
      if (this.onProtocolWarning) this.onProtocolWarning(warning);
    }

    if (Array.isArray(message.warnings)) {
      for (const warning of message.warnings) {
        if (typeof warning === 'string' && this.onProtocolWarning) {
          this.onProtocolWarning(warning);
        }
      }
    }
  }

  private handleSocketEnded(): void {
    const hadSocket = this.ws !== null;
    this.disconnectSocket();
    this.connected = false;
    this.latestState = null;

    if (!hadSocket) {
      return;
    }

    if (this.onDisconnected) this.onDisconnected();

    if (this.manualDisconnect || !this.lastConnectOptions) {
      this.setStatus('offline');
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimerId !== null || !this.lastConnectOptions) return;

    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    const baseDelayMs = Math.min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * (2 ** Math.max(0, this.reconnectAttempt - 1))
    );
    const jitteredDelayMs = Math.round(baseDelayMs * (0.75 + Math.random() * 0.5));

    this.reconnectTimerId = window.setTimeout(() => {
      this.reconnectTimerId = null;
      if (this.manualDisconnect || !this.lastConnectOptions) {
        return;
      }
      this.openSocket(this.lastConnectOptions, true);
    }, jitteredDelayMs);
  }

  private markFresh(): void {
    if (this.connected) {
      this.setStatus('connected');
    }
    this.armStaleTimer();
  }

  private armStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimerId = window.setTimeout(() => {
      if (this.connected) {
        this.setStatus('stale');
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
    this.clearStaleTimer();
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
    if (this.onStatusChange) this.onStatusChange(status);
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.disconnectSocket();
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
    this.kuiperActive = false;
    this.setStatus('offline');
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  activateKuiper(center: Vector3Like, spread: number): void {
    if (!this.kuiperActive) {
      this.send({ type: 'activate_kuiper', center: [center.x, center.y, center.z], spread });
      this.kuiperActive = true;
    }
  }

  deactivateKuiper(): void {
    if (this.kuiperActive) {
      this.send({ type: 'deactivate_kuiper' });
      this.kuiperActive = false;
      this.latestKuiper = null;
    }
  }
}
