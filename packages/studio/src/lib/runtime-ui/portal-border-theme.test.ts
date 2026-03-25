import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRelativeSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("portal-backed runtime ui surfaces carry the Studio border token explicitly", () => {
  const selectSource = readRelativeSource("./components/ui/select.tsx");
  const dropdownSource = readRelativeSource(
    "./components/ui/dropdown-menu.tsx",
  );
  const popoverSource = readRelativeSource("./components/ui/popover.tsx");
  const dialogSource = readRelativeSource("./components/ui/dialog.tsx");

  assert.match(
    selectSource,
    /rounded-md border border-border shadow-md/,
    "Select content should use the themed border token inside the portal",
  );
  assert.match(
    dropdownSource,
    /rounded-md border border-border p-1 shadow-md/,
    "Dropdown menu content should use the themed border token inside the portal",
  );
  assert.match(
    dropdownSource,
    /rounded-md border border-border p-1 shadow-lg/,
    "Dropdown submenu content should use the themed border token inside the portal",
  );
  assert.match(
    popoverSource,
    /rounded-md border border-border p-4 shadow-md/,
    "Popover content should use the themed border token inside the portal",
  );
  assert.match(
    dialogSource,
    /rounded-lg border border-border p-6 shadow-lg/,
    "Dialog content should use the themed border token inside the portal",
  );
});
