# Task List

## Current Goal

Построить VSCode Branch Manager Extension по согласованной архитектуре и MVP scope.

## Working Order

1. Done: заполнить `package.json` manifest для extension и view registration.
2. Реализовать repository discovery и selector UX.
3. Реализовать Git repository adapter и snapshot builder.
4. Реализовать tree normalization и `TreeDataProvider`.
5. Подключить команды `refresh`, `checkout`, `create`, `delete`, `pull`, `push`, `compare`.
6. Добавить handling для confirmations, errors, loading states и SSH auth failures.
7. Довести QA matrix до runnable checks.

## Done

- Зафиксирована архитектура в ADR-документах.
- Создан каркас проекта `src/` с основными слоями.
- Добавлен manifest и базовая регистрация command/view ids.

## Notes

- Источник истины только Git и VSCode context.
- Persistent state не использовать.
- `Source Control` и custom Activity Bar container должны использовать один и тот же `TreeDataProvider`.

## Next Update Rule

После завершения каждого заметного шага обновлять этот файл и оставлять в нем только актуальные задачи.
