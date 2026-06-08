# Task List

## Current Goal

Построить VSCode Branch Manager Extension по согласованной архитектуре и MVP scope.

## Checklist

### Stage 1: Project Shell

- [x] manifest;
- [x] activation events;
- [x] command ids;
- [x] empty `TreeDataProvider`;
- [x] базовая сборка проекта;
- [x] `npm run build` проходит;
- [x] `branchManager.view` и `branchManager.scmView` регистрируются.

### Stage 2: Repository Discovery

- [x] определить active repository;
- [x] поддержать multi-repo selector;
- [x] корректно обрабатывать empty state;
- [x] корректно обрабатывать detached HEAD;
- [x] `npm run build` проходит после изменений.

### Stage 3: Git Adapter and Snapshot

- [x] получить branches/current данные из Git;
- [x] получить полный branch metadata из Git;
- [x] нормализовать raw Git данные в snapshot;
- [x] не хранить persistent state;
- [x] `npm run build` проходит.

### Stage 4: Tree Rendering

- [x] показать дерево в `Source Control` и custom container;
- [x] отрисовать `HEAD / Local / Remote`;
- [ ] добавить search/filter каркас;
- [x] empty state не ломает view;
- [x] `npm run build` проходит;
- [ ] визуально tree соответствует ADR.

### Stage 5: Branch Commands

- [x] подключить `refresh`;
- [x] подключить `checkout`;
- [x] подключить `create`;
- [x] подключить `delete`;
- [x] подключить `pull`;
- [x] подключить `push`;
- [x] команды зарегистрированы;
- [x] командами управляют context keys;
- [x] `npm run build` проходит;
- [ ] destructive actions не выполняются без валидного контекста.

### Stage 6: Confirmations, Errors, Loading, SSH

- [x] добавить confirmation dialogs;
- [x] нормализовать ошибки;
- [x] подключить progress/loading;
- [x] учесть SSH/passphrase failures;
- [x] delete/merge/rebase требуют подтверждения;
- [x] ошибки не оставляют partial state;
- [x] auth failures показываются понятно;
- [x] `npm run build` проходит.

### Stage 7: QA Checks

- [x] проверить `checkout`;
- [x] проверить `pull`;
- [x] проверить `push`;
- [x] проверить `delete`;
- [x] проверить `merge`;
- [x] проверить `rebase`;
- [ ] пройтись по полной QA matrix;
- [ ] подтвердить крайние сценарии;
- [ ] сценарии из `artifacts/adr/qa-matrix.md` покрыты;
- [ ] нет расхождений между ADR и реализацией;
- [ ] можно выделить оставшиеся gaps.

## Remaining Edge Cases

- [x] `dirty working tree` - незакоммиченные изменения не ломают команды.
- [ ] `missing/stale upstream` - у локальной ветки upstream отсутствует или устарел, и нужно убедиться, что это не ломает команды и расчёт статуса.
- [x] `remote refresh after push/fetch` - после `push` или `fetch` список remote-веток обновляется корректно.
- [ ] `multiple repositories in workspace` - в одном workspace больше одного Git repository, и нужно проверить selector репозитория.
- [x] `detached HEAD` - checkout/switch на commit проверен, ветки продолжают отображаться, `HEAD` пустой, показывается message.

## Done

- Зафиксирована архитектура в ADR-документах.
- Создан каркас проекта `src/` с основными слоями.
- Добавлен manifest и базовая регистрация command/view ids.
- Сборка `npm run build` проходит.

## Notes

- Источник истины только Git и VSCode context.
- Persistent state не использовать.
- `Source Control` и custom Activity Bar container должны использовать один и тот же `TreeDataProvider`.

## Update Rule

После завершения каждого заметного шага обновлять чеклист и отмечать выполненные пункты, не удаляя уже закрытые задачи.
