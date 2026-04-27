# CMS-61 Studio Runtime Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconcile the stale Studio delivery ADR with the already-approved module-only Studio runtime contract.

**Architecture:** This is a docs-only change. Update the ADR so its rationale and consequences match the module-only decision already owned by the live specs, then verify that no canonical docs still present the execution mode as undecided.

**Tech Stack:** Markdown docs, ripgrep, Bun workspace verification commands

---

### Task 1: Reconcile ADR-003

**Files:**

- Modify: `docs/adrs/ADR-003-studio-delivery-approach-c.md`
- Verify against: `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- Verify against: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Verify against: `packages/studio/README.md`

**Step 1: Update the stale ADR language**

Change the security/delivery and consequence sections so they no longer describe `iframe` vs `module` as an open MVP choice.

**Step 2: Align the rationale with the live contract**

State that MVP uses `module` execution because it aligns with the capability-limited host bridge, MDX preview integration, and the existing thin-loader architecture.

**Step 3: Run targeted consistency checks**

Run: `rg -n "decision is open|stays open|iframe.*module|execution mode remains" docs/adrs docs/specs packages/studio`
Expected: no remaining stale open-decision wording in canonical docs for the MVP Studio execution mode

**Step 4: Run format verification**

Run: `bun run format:check`
Expected: PASS

**Step 5: Review git status**

Run: `git status --short`
Expected: only the intended tracked docs change is modified, and local-only files remain untracked

## Notes

- `docs/plans/` is local-only in this repository, so this plan should remain untracked.
