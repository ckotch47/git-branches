# ADR: Commands and Context Keys

## Goal

Зафиксировать, какие команды существуют, когда они доступны и по какому объекту работают.

## Branch Types

Нужно различать:

- `HEAD` item;
- local branch;
- remote branch;
- empty repository state;
- detached HEAD state.

## Command Matrix

### Refresh

- Available: always, если открыт repository context.
- Target: current snapshot.
- Effect: rebuild tree from Git.

### Checkout

- Available on: local branch, remote branch, selected valid ref.
- Not available on: `HEAD` pseudo-node, empty state.
- Effect: switch current branch.
- Validation: branch exists, repo clean-state checks only if command требует confirmation.

### Create Branch

- Available on: current branch context, optionally selected base branch.
- Not available on: empty state without repo.
- Effect: create new local branch.
- Validation: new name is valid, branch does not already exist.

### Delete Branch

- Available on: local branch only.
- Not available on: current branch, remote branch, `HEAD`.
- Effect: delete local branch.
- Validation: branch is not checked out, optional merged check.
- Confirmation: required before execution.

### Pull

- Available on: repository context with current branch.
- Not available on: empty state.
- Effect: `git pull` in current branch.
- Validation: upstream may be missing; if so, show clear error or setup prompt.

### Push

- Available on: current local branch.
- Not available on: remote branch only, empty state.
- Effect: `git push`.
- Validation: upstream may be missing; if so, setup flow or error.

### Compare with Current

- Available on: selected branch different from current branch.
- Not available on: current branch itself.
- Effect: open diff viewer for `current` vs `selected`.
- Validation: both refs resolved.
- Direction: current is left side, selected is right side.

### Merge into Current

- Available on: selected local branch.
- Not available on: current branch selected as source.
- Effect: merge selected into current branch.
- Validation: repo in valid state, branch exists.
- Confirmation: required before execution.

### Rebase Current onto Selected

- Available on: selected local branch.
- Not available on: current branch selected as target.
- Effect: rebase current onto selected branch.
- Validation: repo in valid state, branch exists.
- Direction: current branch is rebased onto selected branch.
- Confirmation: required before execution.

## Context Keys

Нужны следующие ключи:

- `branchManager.hasRepository`
- `branchManager.isEmptyState`
- `branchManager.isDetachedHead`
- `branchManager.selectedIsCurrent`
- `branchManager.selectedIsLocal`
- `branchManager.selectedIsRemote`
- `branchManager.canCheckout`
- `branchManager.canCreateBranch`
- `branchManager.canDeleteBranch`
- `branchManager.canPull`
- `branchManager.canPush`
- `branchManager.canCompare`
- `branchManager.canMerge`
- `branchManager.canRebase`

## Rules

- UI не вычисляет доступность команд самостоятельно.
- Use case слой выставляет context keys на основе snapshot и selection.
- Context keys должны обновляться после каждого refresh и после любого branch action.

## Notes

- `HEAD` - это не ветка, а псевдо-узел состояния.
- Remote branch не должен вести себя как local branch без явной поддержки checkout.
- Команды, меняющие состояние, всегда должны завершаться refresh.
