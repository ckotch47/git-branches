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
- upstream missing;
- merge/rebase precondition failed;
- detached HEAD limitations;
- permission or filesystem failures.

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
