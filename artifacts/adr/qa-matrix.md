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
| Detached HEAD | Detached message is shown, local and remote branches remain visible |
| Local branch selected | Checkout, merge, rebase availability is evaluated correctly |
| Remote branch selected | Local destructive actions are restricted |
| Current branch selected | Delete is disabled |
| New branch from selected | New local branch is created from the chosen source branch |
| Rename branch | Non-current local branch is renamed and current/remote are blocked |
| Delete branch | Confirmation dialog is shown before execution |
| Merge into current | Confirmation dialog is shown before execution |
| Rebase current onto selected | Confirmation dialog is shown before execution |
| Checkout and rebase onto selected | Selected branch is checked out and the previous current branch is rebased onto it |
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

### New Branch From Selected

- New branch is created from selected source branch.
- Current and remote branch selection is supported where source is valid.

### Rename Branch

- Non-current local branch name changes after refresh.
- Current branch and remote branch are rejected before execution.

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

### Merge into Current

- Confirmation appears first.
- Operation targets current branch as merge target.

### Rebase Current onto Selected

- Confirmation appears first.
- Operation rebases current branch onto selected branch.

### Checkout and Rebase Onto Selected

- Confirmation appears first.
- Selected branch is checked out.
- Previously current local branch is rebased onto selected branch.

## Acceptance Notes

- Any new command must get a row in this matrix.
- Any new branch state must be covered here before implementation.
- If a scenario cannot be tested manually, it needs a clear automation plan.
