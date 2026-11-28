import assert from "node:assert/strict";
import { test } from "node:test";

test("deliberate failure for the ciwhy PR comment check", () => {
  assert.equal(1 + 1, 3);
});
