# ADR: QA Matrix

## Goal

Зафиксировать минимальный набор сценариев для проверки MVP без привязки к реализации.

## Test Areas

- repository discovery;
- tree rendering;
- command availability;
- destructive action confirmations;
- refresh behavior;
- error handling;
- multiple repository selection;
- detached HEAD behavior.

## Matrix

| Scenario | Expected behavior |
| --- | --- |
| No workspace folder | Empty state with guidance to open a folder or initialize Git |
| Workspace without Git repo | Empty state with guidance to initialize or open a repository |
| One Git repository | Tree opens directly for that repository |
| Multiple Git repositories | Selector is shown and tree is built only for selected repository |
| Detached HEAD | HEAD node shows detached state, branch actions are restricted |
| Local branch selected | Checkout, compare, merge, rebase availability is evaluated correctly |
| Remote branch selected | Compare is available, local destructive actions are restricted |
| Current branch selected | Delete is disabled, compare with self is disabled |
| Delete branch | Confirmation dialog is shown before execution |
| Merge into current | Confirmation dialog is shown before execution |
| Rebase current onto selected | Confirmation dialog is shown before execution |
| Refresh after action | Tree is rebuilt and selection context is updated |
| Git command failure | Error message is shown and tree does not enter partial state |
| Upstream missing | Push/pull flow shows actionable message |

## Per-command Checks

### Refresh

- Tree is rebuilt from live Git state.
- Context keys are updated.
- No duplicate refresh remains active.

### Checkout

- Current branch changes.
- Tree updates after command completes.
- Invalid target is rejected before execution.

### Create Branch

- New branch appears after refresh.
- Duplicate name is rejected.

### Delete Branch

- Confirmation appears first.
- Current branch cannot be deleted.
- Successful delete removes branch from tree after refresh.

### Pull

- Executes on current repository context.
- Missing upstream produces a clear action-oriented error.

### Push

- Executes on current local branch.
- Missing upstream produces a clear action-oriented error.

### Compare with Current

- Opens built-in diff viewer.
- Direction is current vs selected.

### Merge into Current

- Confirmation appears first.
- Operation targets current branch as merge target.

### Rebase Current onto Selected

- Confirmation appears first.
- Operation rebases current branch onto selected branch.

## Acceptance Notes

- Any new command must get a row in this matrix.
- Any new branch state must be covered here before implementation.
- If a scenario cannot be tested manually, it needs a clear automation plan.
