# ADR: Commands and Context Keys

## Goal

Зафиксировать, какие команды существуют, когда они доступны и по какому объекту работают.

## Branch Types

Нужно различать:

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
- Not available on: empty state.
- Effect: switch current branch; remote branch uses tracking checkout.
- Validation: branch exists, repo clean-state checks only if command требует confirmation.

### New Branch From Selected

- Available on: local branch, remote branch.
- Not available on: empty state, detached placeholder, current branch-only menu if no selected branch exists.
- Effect: create a new local branch from selected source branch.
- Validation: new name is valid, source branch exists.

### Create Branch

- Available on: current branch context, optionally selected base branch.
- Not available on: empty state without repo.
- Effect: create new local branch.
- Validation: new name is valid, branch does not already exist.

### Rename Branch

- Available on: non-current local branch.
- Not available on: current branch, remote branch, empty state.
- Effect: rename local branch.
- Validation: new name is valid, target name does not already exist.

### Delete Branch

- Available on: non-current local branch only.
- Not available on: current branch, remote branch.
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

### Checkout and Rebase Onto Selected

- Available on: selected local branch or remote branch.
- Not available on: empty state, detached state.
- Effect: checkout selected branch and rebase previously current branch onto it.
- Validation: current branch exists and is local, target branch exists.
- Confirmation: required before execution.

## Context Keys

Нужны следующие ключи:

- `branchManager.hasRepository`
- `branchManager.isEmptyState`
- `branchManager.isDetachedHead`
- `branchManager.canMerge`
- `branchManager.canRebase`
- `branchManager.canCheckout`
- `branchManager.canDeleteBranch`
- `branchManager.canPull`
- `branchManager.canPush`
- `branchManager.canCreateBranch`

## Rules

- UI не вычисляет доступность команд самостоятельно.
- Use case слой выставляет context keys на основе snapshot и selection.
- Context keys должны обновляться после каждого refresh и после любого branch action.

## Notes

- `HEAD` - это не ветка, а псевдо-узел состояния.
- Remote branch не должен вести себя как local branch без явной поддержки checkout.
- Команды, меняющие состояние, всегда должны завершаться refresh.
