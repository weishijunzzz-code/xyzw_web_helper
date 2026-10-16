import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/loadModule.js";

test("backend connection logs omit credential queries and early close clears the timeout", async () => {
  const timers = new Map();
  let timerId = 0;
  class Socket {
    constructor() {
      this.handlers = {};
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    close() {}
  }
  const { GameClient } = await loadModule(
    new URL("../render-backend/lib/gameClient.js", import.meta.url),
    {
      "./bonProtocol.js": {},
      ws: { default: Socket },
    },
    {
      setTimeout(callback) {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  );
  const client = new GameClient({ roleToken: "secret-test-token", roleId: 1 });
  const logs = [];
  client.log = (...args) => logs.push(args);
  const connection = client.connect();
  const rejected = assert.rejects(connection, /连接在建立前已关闭/);
  client.ws.handlers.close(1006, "closed");
  await rejected;
  assert.equal(timers.size, 0);
  assert.equal(JSON.stringify(logs).includes("secret-test-token"), false);
  assert.equal(logs[0][1], "wss://xxz-xyzw.hortorgames.com/agent");
});
