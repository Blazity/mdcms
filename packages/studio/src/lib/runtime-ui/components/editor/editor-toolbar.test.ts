import assert from "node:assert/strict";
import { test } from "node:test";

import { createEditorToolbarLayout } from "./editor-toolbar.js";

test("createEditorToolbarLayout restores the missing toolbar controls in grouped rows", () => {
  const layout = createEditorToolbarLayout();

  assert.deepEqual(
    layout.primaryGroups.map((group) => group.id),
    ["history", "formatting", "headings", "lists", "blocks", "media"],
  );

  const itemIds = layout.primaryGroups.flatMap((group) =>
    group.items.map((item) => item.id),
  );

  assert.ok(itemIds.includes("taskList"));
  assert.ok(itemIds.includes("horizontalRule"));
  assert.ok(itemIds.includes("table"));
  assert.equal(layout.secondaryItems[0]?.id, "insertComponent");
});

test("createEditorToolbarLayout marks only unfinished controls as visual-only", () => {
  const layout = createEditorToolbarLayout();
  const itemById = new Map(
    [
      ...layout.primaryGroups.flatMap((group) => group.items),
      ...layout.secondaryItems,
    ].map((item) => [item.id, item]),
  );

  assert.equal(itemById.get("taskList")?.availability, "enabled");
  assert.equal(itemById.get("horizontalRule")?.availability, "enabled");
  assert.equal(itemById.get("table")?.availability, "visual-only");
  assert.equal(itemById.get("insertComponent")?.availability, "enabled");
});
