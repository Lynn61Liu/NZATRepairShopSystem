# Job List Light Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light strip bind/light-on action to the job list table that behaves like the job detail header.

**Architecture:** Reuse the existing job detail light binding APIs from the table. Add a shared selector for current binding choice, then wire a per-row action and binding dialog into `JobsTable`.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner with `tsx`.

---

### Task 1: Shared Binding Selector

**Files:**
- Modify: `apps/shell/src/features/jobDetail/lightBindingDialog.ts`
- Modify: `apps/shell/src/features/jobDetail/lightBindingDialog.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for `selectCurrentLightBinding`, covering `Bound`, `PendingBind`, and no usable binding.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/shell && npx tsx --test src/features/jobDetail/lightBindingDialog.test.ts`

Expected: FAIL because `selectCurrentLightBinding` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Export a selector that returns the first `Bound` binding, otherwise first `PendingBind`, otherwise `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/shell && npx tsx --test src/features/jobDetail/lightBindingDialog.test.ts`

Expected: PASS.

### Task 2: Wire Job List Action

**Files:**
- Modify: `apps/shell/src/pages/jobs/JobsTable.tsx`
- Modify: `apps/shell/src/features/jobDetail/components/JobHeader.tsx`

- [ ] **Step 1: Reuse selector in job detail**

Replace the inline current-binding choice in `JobHeader` with `selectCurrentLightBinding`.

- [ ] **Step 2: Add list action state**

In `JobsTable`, add state for active row action, binding dialog, tag input, current/result binding, and success/error messages.

- [ ] **Step 3: Add list action behavior**

On click, fetch bindings for the row. If current binding is `Bound`, call `lightOnJobLightBinding`. If no binding exists, open the bind dialog. If another current status exists, show that status in a toast-style inline message.

- [ ] **Step 4: Add binding dialog**

Copy the existing job detail dialog behavior into the table with the row's plate shown read-only and the same tag validation/polling behavior.

- [ ] **Step 5: Verify build**

Run: `cd apps/shell && npm run build`

Expected: TypeScript and Vite build succeed.
