import assert from "node:assert/strict";
import test from "node:test";
import { bon as backendBon } from "../render-backend/lib/bonProtocol.js";
import { bon } from "../src/utils/bonProtocol.js";

for (const [name, codec] of [
  ["browser", bon],
  ["backend", backendBon],
]) {
  test(`${name} BON preserves nested arrays, repeated strings, and dates`, () => {
    const original = {
      values: ["repeated", "repeated", [0, false, null]],
      created: new Date("2026-01-01T00:00:00.000Z"),
    };
    assert.deepEqual(codec.decode(codec.encode(original)), original);
  });
}
