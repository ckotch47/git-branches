# ADR: Refresh and Concurrency

## Goal

Зафиксировать, как extension обновляет дерево и как избегает гонок.

## Refresh Triggers

Refresh запускается:

- после любой команды, меняющей Git state;
- при смене repository context;
- по явному `Refresh`;
- по debounced Git filesystem event.

## Concurrency Rules

- Только один active refresh на repository.
- Если приходит новый refresh, старый должен быть отменён или помечен устаревшим.
- UI не должен получать результаты от уже устаревшего snapshot.

## Cache Rules

- Кэш только transient.
- Кэш не переживает restart extension host.
- Кэш используется только для одного цикла UI-обновления или короткого burst окна.

## Performance Rules

- Не запускать тяжёлые git операции на каждый minor UI event.
- Не пересчитывать metadata для всех веток без необходимости.
- Для больших репозиториев метаданные лучше подгружать лениво, если это не ломает MVP.

## Recommended Implementation Shape

- refresh request -> queue/debounce -> snapshot build -> tree replace;
- по завершении refresh обновить context keys;
- если операция завершилась ошибкой, не заменять текущий snapshot частично.

## Реализация (факт)

- In-flight дедупликация в `BranchViewProvider.ensureSnapshot`: параллельные запросы делят один `buildSnapshot`.
- Transient TTL 1500мс (burst-окно, сбрасывается на `refresh()`, не переживает restart).
- Ahead/behind считаются пулом max 8 параллельных `rev-list` вместо неограниченного `Promise.all`.
- FileSystemWatcher на `.git/{HEAD,refs/**,index}` с debounce 500мс + best-effort подписка на VS Code Git extension API; watcher пересоздается при смене репозитория и dispose-ится с контекстом.
- Watcher-триггеры делают только локальный rebuild (без fetch) — сетевые операции только по явным командам.
- Полного queue/cancel устаревших refresh нет: in-flight + TTL покрывают burst-окно MVP; очередь — при росте жалоб на больших репо.

## Recommendation

Refresh pipeline должен быть централизован в application layer. UI и git adapter не должны самостоятельно запускать параллельные обновления.
