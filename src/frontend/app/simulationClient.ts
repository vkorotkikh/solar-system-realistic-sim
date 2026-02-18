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
}

type IncomingMessage = ServerStateUpdateMessage | ConnectedMessage;

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export class SimulationClient {
  private readonly buildWebSocketUrl: BuildWebSocketUrl;

  private ws: WebSocket | null;

  private connected: boolean;

  latestState: ServerStateUpdateMessage | null;

  latestKuiper: number[][] | null;

  private kuiperActive: boolean;

  onConnected: (() => void) | null;

  onDisconnected: (() => void) | null;

  onServerReady: ((client: SimulationClient) => void) | null;

  constructor({ buildWebSocketUrl }: { buildWebSocketUrl: BuildWebSocketUrl }) {
    this.buildWebSocketUrl = buildWebSocketUrl;
    this.ws = null;
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
    this.kuiperActive = false;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onServerReady = null;
  }

  connect(backend: 'rebound' | 'kepler' | string = 'rebound', port = 8042): void {
    if (this.ws) this.disconnect();
    const integrator = backend === 'rebound' ? 'ias15' : 'whfast';
    this.ws = new WebSocket(this.buildWebSocketUrl({
      port,
      params: {
        engine: backend,
        integrator
      }
    }));

    this.ws.onopen = () => {
      this.connected = true;
      if (this.onConnected) this.onConnected();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data) as IncomingMessage;
        if (msg.type === 'state_update') {
          this.latestState = msg;
          if (msg.kuiper) {
            this.latestKuiper = msg.kuiper;
          }
        } else if (msg.type === 'connected') {
          if (this.onServerReady) this.onServerReady(this);
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.latestState = null;
      if (this.onDisconnected) this.onDisconnected();
    };

    this.ws.onerror = () => {
      this.connected = false;
      if (this.onDisconnected) this.onDisconnected();
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
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
