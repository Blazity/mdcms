import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  nextMdxComponentCollapseSnapshot,
  toggleMdxComponentCollapseSnapshot,
  type MdxComponentCollapseSnapshot,
} from "./mdx-component-collapse.js";

const initialSnapshot: MdxComponentCollapseSnapshot = {
  globalState: null,
  generation: 0,
};

test("nextMdxComponentCollapseSnapshot bumps generation and applies the requested mode", () => {
  const collapsed = nextMdxComponentCollapseSnapshot(
    initialSnapshot,
    "collapsed",
  );
  assert.equal(collapsed.globalState, "collapsed");
  assert.equal(collapsed.generation, 1);

  const expanded = nextMdxComponentCollapseSnapshot(collapsed, "expanded");
  assert.equal(expanded.globalState, "expanded");
  assert.equal(expanded.generation, 2);
});

test("nextMdxComponentCollapseSnapshot bumps generation even when the mode is unchanged", () => {
  // Re-broadcasting the same mode is the contract for "force every node
  // view back into the announced mode" — node views snap their local
  // state on every generation bump, so the generation must change even
  // if the global mode does not.
  const first = nextMdxComponentCollapseSnapshot(initialSnapshot, "collapsed");
  const second = nextMdxComponentCollapseSnapshot(first, "collapsed");

  assert.equal(second.globalState, "collapsed");
  assert.equal(second.generation, 2);
});

test("toggleMdxComponentCollapseSnapshot collapses from the default snapshot", () => {
  const next = toggleMdxComponentCollapseSnapshot(initialSnapshot);
  assert.equal(next.globalState, "collapsed");
  assert.equal(next.generation, 1);
});

test("toggleMdxComponentCollapseSnapshot flips between collapsed and expanded", () => {
  const collapsed = toggleMdxComponentCollapseSnapshot(initialSnapshot);
  const expanded = toggleMdxComponentCollapseSnapshot(collapsed);
  const collapsedAgain = toggleMdxComponentCollapseSnapshot(expanded);

  assert.equal(collapsed.globalState, "collapsed");
  assert.equal(expanded.globalState, "expanded");
  assert.equal(collapsedAgain.globalState, "collapsed");

  // Generation is monotonically increasing across toggles.
  assert.equal(collapsed.generation, 1);
  assert.equal(expanded.generation, 2);
  assert.equal(collapsedAgain.generation, 3);
});
