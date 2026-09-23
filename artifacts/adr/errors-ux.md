# ADR: Errors and UX

## Goal

Зафиксировать, как extension сообщает об ошибках и состояниях, не превращая UI в шумный инструмент.

## Error Classes

Нужно различать:

- repository not found;
- git command failed;
- branch not found;
- branch already exists;
- branch cannot be deleted;
- branch cannot be checked out;
- upstream missing (`git_no_upstream` — actionable: push with `--set-upstream`);
- merge/rebase precondition failed;
- detached HEAD limitations;
- permission or filesystem failures;
- dirty worktree (`git_dirty_worktree` — ведет в Stash & Continue флоу, а не в тупик);
- invalid branch name (`invalid_branch_name` — проверка до вызова git через `check-ref-format`);
- not fully merged (`git_not_fully_merged` — ведет во второй диалог force delete);
- nothing to abort (`git_nothing_to_abort`);
- stash pop conflict (`git_stash_conflict` — изменения остаются в stash).

Реализация: `normalizeGitError` сохраняет domain-коды (`BranchManagerError` с не-`git_error` кодом проходит как есть), сырой git-текст маппится в коды выше.

## Stash Flow

Операции, требующие чистого дерева (checkout, merge, rebase, reset текущей), при dirty показывают «Stash & Continue» вместо голой ошибки. Stash делается с `-u` (untracked тоже, иначе дерево останется dirty). После операции stash возвращается автоматически (`pop`); конфликт pop не теряет данные — stash-запись остается, пользователь видит actionable-ошибку.

## UX Rules

- Ошибка должна быть конкретной, а не общей.
- Сообщение должно содержать действие, которое пользователь может предпринять.
- Если операция не может быть выполнена, UI не должен показывать "успешное" состояние.
- После ошибки tree не должен оставаться в частично обновлённом состоянии.

## Notification Strategy

- Для простых user-facing ошибок использовать concise notification.
- Для debug-level диагностики писать детали в output channel.
- Не дублировать одну и ту же ошибку одновременно в нескольких местах без необходимости.

## Empty and Loading States

- Empty state должен объяснять, что репозиторий не найден или Git не инициализирован.
- Loading state должен быть коротким и не блокировать весь workbench.
- Если refresh занимает время, UI должен показывать progress, а не зависать.

## Validation Before Action

Перед destructive action надо проверять:

- выбран ли правильный тип node;
- можно ли выполнить команду в текущем состоянии репозитория;
- не приведёт ли действие к очевидной потере контекста.

## Confirmation Dialogs

Требуются явные подтверждения для:

- delete branch;
- merge into current;
- rebase current onto selected.

Диалог должен объяснять:

- что именно произойдет;
- какую ветку/цель затронет операция;
- есть ли риск потери работы или переписывания истории.

## Recommendation

Все ошибки должны проходить через единый mapper из domain error в UI message. Это сократит дублирование и сделает поведение предсказуемым.
