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

- [ ] определить active repository;
- [ ] поддержать multi-repo selector;
- [ ] корректно обрабатывать empty state;
- [ ] корректно обрабатывать detached HEAD;
- [ ] `npm run build` проходит после изменений.

### Stage 3: Git Adapter and Snapshot

- [ ] получить branches/current/metadata из Git;
- [ ] нормализовать raw Git данные в snapshot;
- [ ] не хранить persistent state;
- [ ] `npm run build` проходит.

### Stage 4: Tree Rendering

- [ ] показать дерево в `Source Control` и custom container;
- [ ] отрисовать `HEAD / Local / Remote`;
- [ ] добавить search/filter каркас;
- [ ] empty state не ломает view;
- [ ] `npm run build` проходит;
- [ ] визуально tree соответствует ADR.

### Stage 5: Branch Commands

- [ ] подключить `refresh`;
- [ ] подключить `checkout`;
- [ ] подключить `create`;
- [ ] подключить `delete`;
- [ ] подключить `pull`;
- [ ] подключить `push`;
- [ ] подключить `compare`;
- [ ] команды зарегистрированы;
- [ ] командами управляют context keys;
- [ ] `npm run build` проходит;
- [ ] destructive actions не выполняются без валидного контекста.

### Stage 6: Confirmations, Errors, Loading, SSH

- [ ] добавить confirmation dialogs;
- [ ] нормализовать ошибки;
- [ ] подключить progress/loading;
- [ ] учесть SSH/passphrase failures;
- [ ] delete/merge/rebase требуют подтверждения;
- [ ] ошибки не оставляют partial state;
- [ ] auth failures показываются понятно;
- [ ] `npm run build` проходит.

### Stage 7: QA Checks

- [ ] пройтись по QA matrix;
- [ ] подтвердить основные сценарии;
- [ ] сценарии из `artifacts/adr/qa-matrix.md` покрыты;
- [ ] нет расхождений между ADR и реализацией;
- [ ] можно выделить оставшиеся gaps.

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
