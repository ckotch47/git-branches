# ADR: Menu Placement

## Goal

Зафиксировать, где именно появляются действия расширения в UI.

## Principles

- Команды должны быть доступны там, где пользователь ожидает branch actions.
- Нельзя перегружать view лишними кнопками.
- Одинаковая команда должна вести себя одинаково в `Source Control` и custom Activity Bar container.

## View Toolbar

В toolbar view должны быть только основные действия:

- refresh;
- fetch all remotes;
- switch repository (navigation, всегда видна — открывает QuickPick);
- возможно quick action для create branch, если это не ломает UX.

## Tree Item Context Menu

На branch item доступны:

- checkout;
- new branch from selected;
- copy branch name, copy commit SHA, copy upstream name;
- rename branch (non-current);
- delete branch (non-current, two-step);
- pull / push / reset to remote (local);
- merge into current, rebase current onto selected (с merge-risk hint в диалоге).

На repository root доступны recovery и гигиена:

- create branch, fetch remotes;
- abort merge, abort rebase;
- filter branches, toggle grouping by prefix;
- delete merged branches, prune gone branches;
- switch repository (дубль через палитру).

## Empty State

Без репозитория view показывает `viewsWelcome` с кнопками: Open Folder (`vscode.openFolder`), Initialize Repository (`git.init`), Clone Repository (`git.clone`). Условие: `!branchManager.hasRepository`.

## Source Control View

Если view показан внутри `Source Control` container:

- toolbar actions должны быть минимальными;
- контекстные команды должны быть доступны через tree item menu;
- не надо дублировать встроенные Git actions, которые уже есть в core SCM.

## Custom Activity Bar View

Если view показан в custom container:

- можно чуть более явно показать selector и refresh;
- можно использовать его как debug-friendly место для проверки состояния дерева;
- всё равно не перегружать toolbar.

## Command Visibility

Команды видимы только если соответствующий `context key` разрешает их выполнение.

## Recommendation

Toolbar должен оставаться коротким, а основная навигация и действия должны жить в tree item context menu. Это лучше масштабируется и меньше конкурирует с built-in SCM.
