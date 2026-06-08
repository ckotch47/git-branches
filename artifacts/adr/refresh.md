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

## Recommendation

Refresh pipeline должен быть централизован в application layer. UI и git adapter не должны самостоятельно запускать параллельные обновления.
