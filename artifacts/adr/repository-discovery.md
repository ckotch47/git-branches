# ADR: Repository Discovery and Context

## Goal

Понять, как extension находит репозиторий и в каком контексте работает.

## Source of Truth

Для MVP источники истины:

- `VSCode workspace folders`;
- активный editor context;
- Git repository state;
- текущий workspace/repository path.

## Discovery Rules

- Если открыт workspace с Git repository, extension работает в этом контексте.
- Если открыто несколько репозиториев, нужен явный selector со списком доступных repositories.
- Если репозиторий не найден, view показывает empty state.
- Если состояние `detached HEAD`, это отдельный режим отображения, а не ошибка обнаружения.

## Scope

Контекст должен быть привязан к:

- текущему workspace folder;
- конкретному repository path;
- активному окну VSCode, если открыто несколько рабочих пространств.

## Recommended Behavior

- Не сканировать весь диск.
- Не пытаться угадать репозиторий вне workspace.
- Не смешивать данные нескольких репозиториев в одном дереве.
- Если repositories несколько, показывать selection control и строить tree только для выбранного repository.
- При смене активного workspace/repository выполнять refresh.

## Open Questions

- Нужно ли поддерживать nested repositories?

## Recommendation

Для MVP поддерживать один active repository per view instance. Если repositories несколько, пользователь явно выбирает repository из списка. Это минимизирует неоднозначность и упрощает refresh, ошибки и commands.
