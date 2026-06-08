# ADR: Manifest and View Placement

## Activation

Расширение должно активироваться только когда есть практический повод:

- открыта workspace-папка;
- доступен Git repository;
- пользователь открывает вкладку/вьюху расширения;
- вызывается одна из команд расширения.

## Contributions

Нужны следующие разделы manifest:

- `contributes.viewsContainers`
  - custom Activity Bar container для отладки;
  - опционально иконка контейнера.
- `contributes.views`
  - view внутри custom container;
  - view внутри `scm` container;
  - оба view должны использовать один и тот же `TreeDataProvider`.
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

- container id для Activity Bar;
- view id для custom container;
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

Для пустого состояния в `scm` view и custom view нужен единый подход:

- показать, что repository не найден;
- показать, что нужно открыть папку или инициализировать Git;
- дать одну primary action.

## Why this shape

Такая структура делает extension управляемым:

- UI можно отлаживать в изолированном container;
- рабочий сценарий доступен прямо в Source Control;
- одна логика обслуживает оба места;
- нет дублирования бизнес-логики между двумя view.
