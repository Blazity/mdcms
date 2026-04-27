# Grouped Content List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add grouped localized content rows to the content list API and Studio `/admin/content/:type` so localized logical documents render once per translation group.

**Architecture:** Extend the existing `GET /api/v1/content` contract with `groupBy=translationGroup` for localized types, aggregate rows server-side after filtering and before pagination, then update Studio's content list client and type list UI to consume grouped entries instead of raw locale documents. Keep non-localized behavior unchanged.

**Tech Stack:** Bun, Nx, TypeScript, Bun test, Studio React runtime, server content API/database store.

---

### Task 1: Shared contracts and failing API tests

**Files:**
- Modify: `packages/shared/src/lib/contracts/content-api.ts`
- Modify: `apps/server/src/lib/content-api/types.ts`
- Test: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

### Task 2: Server grouped list implementation

**Files:**
- Modify: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api/responses.ts`

### Task 3: Studio grouped list contract and failing UI tests

**Files:**
- Modify: `packages/studio/src/lib/content-list-api.ts`
- Modify: `packages/studio/src/lib/runtime-ui/hooks/use-content-type-list.ts`
- Test: `packages/studio/src/lib/content-list-api.test.ts`
- Test: `packages/studio/src/lib/runtime-ui/hooks/use-content-type-list.test.ts`
- Test: `packages/studio/src/lib/runtime-ui/app/admin/content/[type]/page.test.tsx`

### Task 4: Studio page behavior

**Files:**
- Modify: `packages/studio/src/lib/runtime-ui/app/admin/content/[type]/page.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/lib/content-translation-coverage.ts`

### Task 5: Spec parity in this branch and targeted verification

**Files:**
- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`

