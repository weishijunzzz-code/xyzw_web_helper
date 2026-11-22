export class PushService {
  constructor(wss, { verifyToken, ownsAccount }) {
    this.wss = wss;
    this.clients = new Map();
    this.ownsAccount = ownsAccount;

    wss.on('connection', (ws) => {
      const authTimeout = setTimeout(() => ws.close(1008, "Authentication required"), 5000);
      const cleanup = () => {
        clearTimeout(authTimeout);
        this.clients.delete(ws);
      };
      ws.once("message", (data) => {
        try {
          const { token } = JSON.parse(String(data));
          const auth = verifyToken(token);
          if (!auth?.userId) return ws.close(1008, "Authentication required");
          clearTimeout(authTimeout);
          this.clients.set(ws, auth);
        } catch {
          ws.close(1008, "Authentication required");
        }
      });
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  }

  broadcast(type, data) {
    const msg = JSON.stringify({ type, data, ts: Date.now() });
    for (const [ws, auth] of this.clients) {
      if (auth.exp <= Date.now()) {
        ws.close(1008, "Session expired");
      } else if (ws.readyState === 1 && this.ownsAccount(data?.tokenId, auth.userId)) {
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
