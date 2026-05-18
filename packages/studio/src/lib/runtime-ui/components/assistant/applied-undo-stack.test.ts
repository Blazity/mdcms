import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  _appliedUndoStackSize,
  pushAppliedUndoHandler,
  triggerTopAppliedUndo,
} from "./applied-undo-stack.js";

test("triggerTopAppliedUndo returns false when the stack is empty", () => {
  // The stack is module-scoped; if a prior test left an entry behind
  // this assertion would be a poor smoke check. Sanity-clamp by
  // draining the stack first so the LIFO ordering test below starts
  // from a known size.
  while (triggerTopAppliedUndo()) {
    /* drain */
  }
  assert.equal(_appliedUndoStackSize(), 0);
  assert.equal(triggerTopAppliedUndo(), false);
});

test("triggerTopAppliedUndo fires LIFO and unsubscribe removes entries", () => {
  const fired: string[] = [];
  const offFirst = pushAppliedUndoHandler(() => fired.push("first"));
  const offSecond = pushAppliedUndoHandler(() => fired.push("second"));

  assert.equal(_appliedUndoStackSize(), 2);
  assert.equal(triggerTopAppliedUndo(), true);
  // The most recently pushed handler fires first — matches the
  // visual stacking of multiple AppliedBanners (the newest is on top
  // of the chat surface, so ⌘Z reverts it first).
  assert.deepEqual(fired, ["second"]);

  // The trigger call does NOT auto-pop — the AppliedBanner's
  // useEffect unsubscribe is the canonical owner of removal. The
  // banner's onUndo handler closes that loop by unmounting after the
  // undo round-trip resolves. Unsubscribe explicitly here.
  offSecond();
  assert.equal(_appliedUndoStackSize(), 1);
  assert.equal(triggerTopAppliedUndo(), true);
  assert.deepEqual(fired, ["second", "first"]);
  offFirst();
  assert.equal(_appliedUndoStackSize(), 0);
});
