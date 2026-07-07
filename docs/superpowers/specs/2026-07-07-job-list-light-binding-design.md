# Job List Light Binding Design

## Goal

Add a light strip action to the job list table's 操作 column that matches the job detail behavior.

## Behavior

- When a job already has a `Bound` light binding, clicking the list action sends the light-on command.
- When a job has no current binding, clicking the list action opens a binding dialog where the user can scan or enter the light tag ID.
- When a job has a non-bound current binding, such as `PendingBind`, the action shows that status and does not send a light-on command.
- Binding validation, polling, success/error states, and messages should match the existing job detail flow.

## Architecture

The list table will reuse the existing job detail API functions:

- `fetchJobLightBindings(jobId)`
- `createJobLightBinding(jobId, tagId)`
- `lightOnJobLightBinding(bindingId)`

A small shared selector in `lightBindingDialog.ts` will choose the current binding by preferring `Bound`, then `PendingBind`. `JobHeader` and `JobsTable` will both use that selector so the behavior stays consistent.

## Testing

Add focused unit coverage for the selector:

- Returns a `Bound` binding before `PendingBind`.
- Returns `PendingBind` when no bound binding exists.
- Returns `null` when there are no usable bindings.

Run the existing light binding dialog test directly with `tsx`.
