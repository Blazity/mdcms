/**
 * Module-local LIFO of post-accept undo handlers. Each `AppliedBanner`
 * pushes its onUndo callback on mount and pops it on unmount (either
 * because the 6-second window expired, the user clicked Undo, or the
 * component was torn down by a tree change).
 *
 * The assistant panel reads the top of the stack in its global
 * keydown listener: when ⌘Z (macOS) or Ctrl+Z (other) fires and focus
 * is inside the panel, the most recently registered handler fires.
 * Multiple stacked banners (rare — happens when the user accepts two
 * proposals inside the same 6s window) follow last-in-first-out so
 * the keyboard shortcut matches the visual stacking the user sees.
 *
 * The stack is intentionally a plain in-memory list rather than React
 * state — it spans across components and would otherwise require a
 * provider just to coordinate keyboard shortcuts.
 */

type UndoEntry = {
  handler: () => void;
};

const stack: UndoEntry[] = [];

/**
 * Push an undo handler onto the stack. Returns a stable unsubscribe
 * callback the caller must invoke on cleanup; calling it removes the
 * entry regardless of where it ended up in the stack (some other
 * banner may have registered between push and pop).
 */
export function pushAppliedUndoHandler(handler: () => void): () => void {
  const entry: UndoEntry = { handler };
  stack.push(entry);
  return () => {
    const idx = stack.indexOf(entry);
    if (idx >= 0) {
      stack.splice(idx, 1);
    }
  };
}

/**
 * Fire the most recently pushed handler, if any. Returns true when a
 * handler was invoked so the caller (the keydown listener) can call
 * `preventDefault()` to keep the OS / browser undo from firing on top.
 */
export function triggerTopAppliedUndo(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.handler();
  return true;
}

/** Test-only — surface the depth so unit tests can assert push/pop balance. */
export function _appliedUndoStackSize(): number {
  return stack.length;
}
