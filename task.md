# Task List

## Current Goal

Построить Git Branches extension по согласованной архитектуре и MVP scope.

## Checklist

### Stage 1: Project Shell

- [x] manifest;
- [x] activation events;
- [x] command ids;
- [x] empty `TreeDataProvider`;
- [x] базовая сборка проекта;
- [x] `npm run build` проходит;
- [x] `branchManager.scmView` регистрируется.

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
- [x] отрисовать `Local / remote groups`;
- [x] добавить search/filter каркас;
- [x] empty state не ломает view;
- [x] `npm run build` проходит;
- [x] визуально tree соответствует ADR.

### Stage 5: Branch Commands

- [x] подключить `refresh`;
- [x] подключить `checkout`;
- [x] подключить `create`;
- [x] подключить `new branch from selected`;
- [x] подключить `delete`;
- [x] подключить `rename`;
- [x] подключить `pull`;
- [x] подключить `push`;
- [x] подключить `checkout and rebase onto selected`;
- [x] команды зарегистрированы;
- [x] командами управляют context keys;
- [x] `npm run build` проходит;
- [x] destructive actions guarded by state and confirmations.

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
- [x] пройтись по полной QA matrix;
- [x] подтвердить крайние сценарии;
- [x] сценарии из `artifacts/adr/qa-matrix.md` покрыты;
- [x] нет расхождений между ADR и реализацией;
- [x] можно выделить оставшиеся gaps.

## Remaining Edge Cases

- [x] `dirty working tree` - незакоммиченные изменения не ломают команды.
- [x] `missing/stale upstream` - push с auto `--set-upstream`, pull/push показывают actionable ошибку `git_no_upstream`.
- [x] `remote refresh after push/fetch` - после `push` или `fetch` список remote-веток обновляется корректно.
- [x] `multiple repositories in workspace` - команда `Switch Repository` + реакция на смену workspace + watcher per-repo.
- [x] `detached HEAD` - checkout/switch на commit проверен, ветки продолжают отображаться, `HEAD` пустой, показывается message.
- [x] `copy branch name` - доступно для local/remote веток.

## Done

- Зафиксирована архитектура в ADR-документах.
- Создан каркас проекта `src/` с основными слоями.
- Добавлен manifest и базовая регистрация command/view ids.
- Сборка `npm run build` проходит.

## Wave 2 (all phases delivered)

- [x] тесты: `node:test`, `npm test` (unit + integration на реальном git), 45 тестов;
- [x] чистка мёртвого кода (`rebaseBranch`, `branchViewActions`, стабы живут только там где реализованы);
- [x] производительность: пул ahead/behind (8), transient TTL 1500мс, in-flight дедупликация;
- [x] живость: `.git`-watcher + Git extension API + `Switch Repository` + реакция на workspace;
- [x] `Filter Branches` + сортировка current-first;
- [x] Stash & Continue, валидация имён через `check-ref-format`, сохранение domain-кодов ошибок;
- [x] гигиена: Delete Merged (`-d`), Prune Gone (`-D` с превью), Copy SHA/Upstream;
- [x] P2: группировка по префиксу (default off), merge-risk hint в диалоге, viewsWelcome с кнопками;
- [x] фикс: добавлен `activationEvents` (без него extension не активировался вообще) + `.vscodeignore`, vsix пересобран.

## Wave 3: Commit Graph (read-only)

- [x] `src/graph/`: сбор `git log`, lanes-алгоритм, compare (файлы коммита/диапазона);
- [x] Webview-панель: lanes-рендер, бейджи refs, фильтр, режимы all/current, детали, compare с diff, checkout;
- [x] поправка к ADR (graph read-only; запрет merge/conflict UI в силе);
- [x] тесты lanes/парсинга + integration на реальном git с мержем (54 теста).

## Notes

- Источник истины только Git и VSCode context.
- Persistent state не использовать.
- `Source Control` и custom Activity Bar container должны использовать один и тот же `TreeDataProvider`.

## Update Rule

После завершения каждого заметного шага обновлять чеклист и отмечать выполненные пункты, не удаляя уже закрытые задачи.
