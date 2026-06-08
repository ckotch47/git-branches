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
- repository selector, если repositories несколько;
- возможно quick action для create branch, если это не ломает UX.

## Tree Item Context Menu

На branch item доступны:

- checkout;
- new branch from selected;
- rename branch;
- delete branch;
- merge into current;
- rebase current onto selected.

На empty state item доступны только:

- open folder / open repository guidance;
- refresh;
- repository selection, если есть несколько repositories.

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
