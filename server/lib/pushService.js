export class PushService {
  constructor(wss) {
    this.wss = wss;
    this.clients = new Set();

    wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  broadcast(type, data) {
    const msg = JSON.stringify({ type, data, ts: Date.now() });
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        ws.send(msg);
      }
    }
  }

  log(tokenId, level, message, extra) {
    this.broadcast('log', { tokenId, level, message, extra });
  }

  connectionStatus(tokenId, status, detail) {
    this.broadcast('connection', { tokenId, status, detail });
  }

  gameData(tokenId, field, value) {
    this.broadcast('gameData', { tokenId, field, value });
  }

  taskProgress(tokenId, taskName, progress, total, message) {
    this.broadcast('taskProgress', { tokenId, taskName, progress, total, message });
  }

  taskComplete(tokenId, taskName, result) {
    this.broadcast('taskComplete', { tokenId, taskName, result });
  }
}
