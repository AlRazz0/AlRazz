import test from "node:test";
import assert from "node:assert/strict";
import { nextLogoTap } from "../src/footer-access.ts";
test("footer requires six successive activations and resets after entering", () => {
  let state = { count: 0, at: -Infinity };
  for (let i = 1; i <= 6; i++) {
    const next = nextLogoTap(state, i * 300);
    assert.equal(next.enter, i === 6);
    state = next;
  }
  assert.equal(state.count, 0);
  assert.equal(nextLogoTap(state, 2000).enter, false);
});
test("separate visits and a reversed clock cannot complete the footer gesture", () => {
  assert.equal(nextLogoTap({ count: 5, at: 1000 }, 5100).count, 1);
  assert.equal(nextLogoTap({ count: 5, at: 1000 }, 900).enter, false);
});
