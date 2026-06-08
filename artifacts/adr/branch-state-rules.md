# ADR: Branch State Rules

## Goal

Зафиксировать правила для current branch, remote branch и detached HEAD.

## Current Branch

- Exactly one local branch can be current in normal state.
- Current branch is shown inline in Local tree.
- Current branch cannot be deleted.
- Current branch is the left side for compare.

## Remote Branch

- Remote branch is a reference, not a local checked-out branch.
- Remote branch can be compared with current.
- Remote branch can be used as a base only if command semantics explicitly allow it.
- Remote branch is not deleteable by local delete action.

## Detached HEAD

- Detached HEAD is a separate state, not a normal branch.
- Branch actions that require a local branch are disabled or hidden.
- UI must show that repository is in detached state.
- Compare can still work only if refs are explicitly resolvable.

## Empty State

- No repository means no branch actions.
- Empty state must not pretend that branches exist.
- Selector and command menus are hidden or reduced to guidance actions.

## Validation Rules

- Commands must validate state before execution.
- UI visibility and backend validation must agree.
- If a command is available in UI, it should still be revalidated in use case layer.

## Recommendation

State rules must be strict and boring. The fewer special cases in UI, the fewer bugs in branch actions.
