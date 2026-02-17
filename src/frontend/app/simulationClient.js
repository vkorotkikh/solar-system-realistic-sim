export class SimulationClient {
  constructor({ buildWebSocketUrl }) {
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

  connect(backend = 'rebound', port = 8042) {
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

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
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

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.latestState = null;
    this.latestKuiper = null;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  activateKuiper(center, spread) {
    if (!this.kuiperActive) {
      this.send({ type: 'activate_kuiper', center: [center.x, center.y, center.z], spread });
      this.kuiperActive = true;
    }
  }

  deactivateKuiper() {
    if (this.kuiperActive) {
      this.send({ type: 'deactivate_kuiper' });
      this.kuiperActive = false;
      this.latestKuiper = null;
    }
  }
}
