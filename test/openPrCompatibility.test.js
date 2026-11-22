import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { PushService } from "../server/lib/pushService.js";
import { buildCampMap, getAttendanceDate, getAttendanceMembers } from "../src/utils/campChallengeView.js";
import { getGoodsFinalPrice } from "../src/utils/shopGoodsPrice.js";

test("cloud events only reach authenticated owners of the game account", () => {
  const server = new EventEmitter();
  const expires = Date.now() + 10000;
  const push = new PushService(server, {
    verifyToken: (token) => token === "invalid" ? null : { userId: token, exp: expires },
    ownsAccount: (account, user) => account === "account-a" && user === "alice",
  });
  function connect() {
    const socket = new EventEmitter();
    const received = [];
    socket.readyState = 1;
    socket.send = (message) => received.push(JSON.parse(message));
    socket.close = () => socket.emit("close");
    server.emit("connection", socket);
    return { socket, received };
  }
  const owner = connect();
  const foreign = connect();
  const anonymous = connect();
  try {
    owner.socket.emit("message", JSON.stringify({ token: "alice" }));
    foreign.socket.emit("message", JSON.stringify({ token: "bob" }));
    push.broadcast("pushLevel", { tokenId: "account-a", status: { running: true } });
    assert.equal(owner.received.length, 1);
    assert.deepEqual(foreign.received, []);
    assert.deepEqual(anonymous.received, []);
  } finally {
    for (const peer of [owner, foreign, anonymous]) peer.socket.close();
  }
});

test("camp preserves empty spots and calculates attack counts by region", () => {
  const member = { id: 5621, slot: 21, defLosses: 2 };
  const map = buildCampMap([member]);
  assert.equal(map.positionsConfirmed, true);
  assert.equal(map.regions[0].emptyCount, 10);
  assert.equal(map.regions[2].slots[0].member.id, member.id);
  assert.deepEqual(map.regions[2].remainingAttacks, { hard: 1, inferno: 2, defeat: 3 });
  assert.equal(getAttendanceMembers([member, { ...member, mirror: true }], {}, { 5621: { power: 123 } })[0].clubPower, 123);
  assert.equal(getAttendanceDate("261116", 6, Date.UTC(2026, 10, 20, 16)).isToday, true);
});

test("shop rounds the server float discount before computing the displayed price", () => {
  assert.equal(getGoodsFinalPrice(3, Math.fround(0.7)), 438);
  assert.equal(getGoodsFinalPrice(2, Math.fround(0.3)), 113);
  assert.equal(getGoodsFinalPrice(1, 2), 400);
  assert.equal(getGoodsFinalPrice(999, 0.5), null);
});
