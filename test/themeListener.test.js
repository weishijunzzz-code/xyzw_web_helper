import assert from "node:assert/strict";
import test from "node:test";
import { listenForThemeChanges } from "../src/utils/themeListener.js";

for (const modern of [true, false]) {
  test(`theme cleanup removes the original callback (${modern ? "modern" : "legacy"} API)`, () => {
    const registered = new Set();
    const media = modern
      ? {
          addEventListener(type, callback) {
            assert.equal(type, "change");
            registered.add(callback);
          },
          removeEventListener(type, callback) {
            assert.equal(type, "change");
            registered.delete(callback);
          },
        }
      : {
          addListener(callback) {
            registered.add(callback);
          },
          removeListener(callback) {
            registered.delete(callback);
          },
        };
    let changes = 0;
    const listener = () => {
      changes++;
    };
    const stop = listenForThemeChanges(media, listener);
    for (const callback of registered) callback();
    assert.equal(changes, 1);
    stop();
    assert.equal(registered.size, 0);
  });
}
