# CMS-85 SDK Spec Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the SDK spec with the agreed read-focused contract and capture the deferred schema-hash pinning decision for future write clients.

**Architecture:** Update the owning SDK spec so it no longer claims runtime-fetched schema can create compile-time typing, define `resolve` as a read option rather than a separate method, and record schema-hash pinning as a proposed ADR instead of an implied runtime cache behavior.

**Tech Stack:** Markdown documentation under `docs/specs/` and `docs/adrs/`

---

### Task 1: Update the SDK spec

**Files:**

- Modify: `docs/specs/SPEC-008-cli-and-sdk.md`

**Step 1:** Replace the misleading runtime typing language with a read-focused SDK contract.

**Step 2:** Define `resolve` as an option on `get` and `list`, not as a standalone SDK method.

**Step 3:** Clarify routing defaults and per-call overrides.

**Step 4:** State that schema-aware writes and schema hash pinning are deferred.

### Task 2: Record the deferred decision

**Files:**

- Create: `docs/adrs/ADR-006-schema-hash-pinning-for-write-clients.md`
- Modify: `docs/adrs/README.md`

**Step 1:** Create a proposed ADR describing the open schema-hash pinning question.

**Step 2:** Document the preferred direction and rejected auto-refresh approach.

**Step 3:** Update the ADR catalog to list the proposed ADR.

### Task 3: Verify the doc delta

**Files:**

- Review: `docs/specs/SPEC-008-cli-and-sdk.md`
- Review: `docs/adrs/ADR-006-schema-hash-pinning-for-write-clients.md`
- Review: `docs/adrs/README.md`

**Step 1:** Re-read the changed sections for spec/ADR consistency.

**Step 2:** Run targeted validation on the touched docs.

**Step 3:** Confirm local-only planning files remain unstaged.
