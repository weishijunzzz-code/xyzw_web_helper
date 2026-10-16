import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/loadModule.js";

const { CacheManager, install } = await loadModule(
  new URL("../src/stores/cache.ts", import.meta.url),
);

test("cache coalesces concurrent readers and accepts an already created Promise", async () => {
  const cache = new CacheManager().getCache("test");
  let resolve;
  const loader = new Promise((done) => {
    resolve = done;
  });
  const first = cache.get("key", loader);
  const second = cache.get("key", () => {
    throw new Error("duplicate loader");
  });
  resolve("value");
  assert.equal(await first, "value");
  assert.equal(await second, "value");
  assert.equal(await cache.get("key", () => "unexpected"), "value");
});

test("cache rejects all waiting readers and retries after a loader failure", async () => {
  const cache = new CacheManager().getCache("test");
  let reject;
  const loader = new Promise((_resolve, fail) => {
    reject = fail;
  });
  const first = cache.get("key", loader);
  const second = cache.get("key", () => "unexpected");
  const rejected = Promise.all([
    assert.rejects(first, /loader failed/),
    assert.rejects(second, /loader failed/),
  ]);
  reject(new Error("loader failed"));
  await rejected;
  assert.equal(await cache.get("key", () => "recovered"), "recovered");
});

test("cache retains falsy values and installs on Vue 3", async () => {
  const cache = new CacheManager().getCache("test");
  assert.equal(await cache.get("zero", () => 0), 0);
  assert.equal(await cache.get("zero", () => 99), 0);
  const app = { version: "3.5.0", config: { globalProperties: {} } };
  install(app);
  assert.ok(app.config.globalProperties.$CacheManager);
});
