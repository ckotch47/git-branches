# ADR: Manifest and View Placement

## Activation

Расширение должно активироваться только когда есть практический повод:

- открыта workspace-папка;
- доступен Git repository;
- пользователь открывает вкладку/вьюху расширения;
- вызывается одна из команд расширения.

## Contributions

Нужны следующие разделы manifest:

- `contributes.views`
  - view внутри `scm` container;
  - один `TreeDataProvider` для дерева веток.
- `contributes.commands`
  - `refresh`;
  - `fetchRemotes`;
  - `checkout`;
  - `createBranch`;
  - `createBranchFromSelected`;
  - `deleteBranch`;
  - `renameBranch`;
  - `pull`;
  - `push`;
  - `mergeIntoCurrent`;
  - `rebaseCurrentOntoSelected`;
  - `checkoutAndRebaseOntoSelected`.
- `contributes.menus`
  - контекстное меню для tree items;
  - toolbar actions для view;
  - при необходимости пункты в SCM view title.
- `contributes.configuration`
  - только если появятся параметры UX или поведения;
  - для MVP можно оставить пустым.

## View IDs

Нужно сразу зафиксировать стабильные id:

- view id для `scm`;
- command ids.

Это важно, потому что потом эти id будут использоваться в `when`-условиях, меню и context keys.

## Context Keys

Чтобы управлять видимостью действий, понадобятся контекстные ключи:

- есть ли активный repository;
- текущая ветка выбрана;
- выбранный item является local branch;
- выбранный item является remote branch;
- доступна ли операция `checkout`;
- доступна ли операция `delete`;
- доступна ли операция `merge/rebase`;
- доступны ли `fetchRemotes` и branch-local actions.

## Empty State

Для пустого состояния в `scm` view нужен единый подход:

- показать, что repository не найден;
- показать, что нужно открыть папку или инициализировать Git;
- дать одну primary action.

## Why this shape

Такая структура делает extension управляемым:

- рабочий сценарий доступен прямо в Source Control;
- одна логика обслуживает единственный view;
- нет дублирования бизнес-логики между разными контейнерами.
