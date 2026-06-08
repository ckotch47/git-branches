# Project Structure: VSCode Branch Manager Extension

## Goal

Собрать минимальную, но чистую структуру проекта для MVP без лишней архитектурной тяжести.

## Principle

- один источник правды для Git snapshot;
- UI не знает о Git CLI;
- команды не живут в UI;
- без persistent state;
- структура должна быть достаточно простой, чтобы не усложнять маленькие операции.

## Recommended Tree

```text
src/
  extension/
    activate.ts
    commands.ts
    context.ts
    registrations.ts

  ui/
    branchViewProvider.ts
    branchTreeItem.ts
    branchViewState.ts
    branchViewActions.ts

  application/
    refreshTree.ts
    branchActions/
      checkoutBranch.ts
      createBranch.ts
      deleteBranch.ts
      pullBranch.ts
      pushBranch.ts
      mergeBranch.ts
      rebaseBranch.ts
    repositorySelection.ts
    contextKeys.ts

  domain/
    branch.ts
    repository.ts
    branchState.ts
    errors.ts
    commands.ts

  infrastructure/
    git/
      gitRepository.ts
      simpleGitRepository.ts
      gitParser.ts
      gitErrors.ts
    vscode/
      repositoryDiscovery.ts
      progress.ts
      outputChannel.ts
      diffLauncher.ts

  tree/
    snapshotBuilder.ts
    treeNormalizer.ts
    treeFilter.ts
    treeModel.ts

  shared/
    logger.ts
    types.ts
    constants.ts
    utils.ts

test/
  unit/
  integration/
```

## Minimal Files for MVP

Если резать до самого необходимого, достаточно начать с:

- `src/extension/activate.ts`
- `src/extension/commands.ts`
- `src/ui/branchViewProvider.ts`
- `src/ui/branchTreeItem.ts`
- `src/application/refreshTree.ts`
- `src/application/branchActions/*`
- `src/domain/*`
- `src/infrastructure/git/*`
- `src/tree/*`

## Responsibilities

### `src/extension`

Wiring:

- activation;
- command registration;
- view registration;
- context initialization.

### `src/ui`

Presentation:

- tree rendering;
- view actions;
- item actions;
- state of current selection for UI.

### `src/application`

Use cases:

- refresh;
- branch operations;
- validation;
- repository selection;
- context key updates.

### `src/domain`

Pure types and errors:

- no VSCode imports;
- no git CLI knowledge;
- no UI dependencies.

### `src/infrastructure`

Concrete integrations:

- Git CLI access;
- VSCode repository discovery;
- progress indicators;
- diff launching;
- output channel logging.

### `src/tree`

Normalization pipeline:

- snapshot build;
- branch grouping;
- filtering;
- view model mapping.

### `src/shared`

Cross-cutting helpers:

- constants;
- generic utilities;
- small shared types;
- logger wrapper if needed.

## Suggested First Pass

Первый рабочий проход лучше делать в таком порядке:

1. `domain`
2. `infrastructure/git`
3. `tree`
4. `application`
5. `ui`
6. `extension`

Это позволяет сначала зафиксировать данные и команды, потом дерево, и только потом UI wiring.

## Notes

- `repositorySelection` лучше держать в application layer, не в UI.
- `diffLauncher` лучше считать infrastructure concern, а не UI concern.
- `contextKeys` должны вычисляться в application layer и применяться через extension context.
- `branchViewState` не должен становиться persistent store.

## Recommendation

Для MVP эта структура достаточно строгая, чтобы код не расползался, и достаточно простая, чтобы не превратиться в overengineering.
