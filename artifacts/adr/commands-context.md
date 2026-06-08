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
- Effect: switch current branch; remote branch uses tracking checkout.
- Validation: branch exists, repo clean-state checks only if command требует confirmation.

### Create Branch

- Available on: current branch context, optionally selected base branch.
- Not available on: empty state without repo.
- Effect: create new local branch.
- Validation: new name is valid, branch does not already exist.

### Delete Branch

- Available on: non-current local branch only.
- Not available on: current branch, remote branch, `HEAD`.
- Effect: delete local branch.
- Validation: branch is not checked out, optional merged check.
- Confirmation: required before execution.

### Pull

- Available on: selected local branch or current branch fallback.
- Not available on: empty state.
- Effect: update the selected local branch from its upstream.
- Validation: upstream may be missing; if so, show clear error or setup prompt.

### Push

- Available on: selected local branch or current local branch fallback.
- Not available on: remote branch only, empty state.
- Effect: push the selected local branch to its remote.
- Validation: remote/upstream may be missing; if so, setup flow or error.

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
