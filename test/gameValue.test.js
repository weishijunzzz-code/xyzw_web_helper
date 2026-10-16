import assert from "node:assert/strict";
import test from "node:test";
import { isSameGameValue } from "../src/utils/gameValue.js";

test("game value comparisons preserve existing ID and missing-value compatibility", () => {
  assert.equal(isSameGameValue(123, "123"), true);
  assert.equal(isSameGameValue(123, "124"), false);
  assert.equal(isSameGameValue(null, undefined), true);
  assert.equal(isSameGameValue(null, 0), false);
  assert.equal(isSameGameValue(false, 0), true);
  assert.equal(isSameGameValue(Number.NaN, Number.NaN), false);
});
