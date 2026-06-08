# ADR: Branch Manager Architecture

## Context

Нужно расширение для VSCode, которое закрывает UX-разрыв по работе с Git-ветками, не дублируя Source Control, Git Graph, GitLens и встроенный Diff Viewer.

Ограничение по продукту:

- фокус только на управлении ветками;
- локальная работа внутри extension host;
- без отдельного backend-сервиса;
- без собственного graph/diff/merge/conflict UI.

## Decision

Рекомендуется сделать расширение как набор чётких слоёв:

- UI layer: `TreeView` + `TreeDataProvider`.
- Application layer: команды, сценарии, оркестрация обновлений.
- Git adapter layer: единый интерфейс к Git-командам.
- Ephemeral cache layer: только короткоживущий кэш snapshot'ов внутри процесса.

Для MVP использовать один extension host без внешних процессов кроме Git CLI. Внутри Git adapter держать изолированный API, чтобы позже можно было заменить реализацию без переписывания UI и бизнес-логики.

## Proposed Architecture

### 1. UI layer

Одна логическая панель `Git Branches` внутри встроенного `Source Control` container.

Дерево:

- `Local`
- remote groups by name

UI не должен знать деталей Git-команд. Он получает уже нормализованные узлы и вызывает команды через application layer.

### 2. Application layer

Слой сценариев отвечает за:

- checkout branch;
- create branch;
- create branch from selected;
- delete branch;
- rename branch;
- pull/push;
- merge into current;
- rebase current onto selected;
- checkout and rebase onto selected;
- refresh tree;
- search/filter.

Этот слой должен быть единственной точкой, где определяется поведение операций и их валидация.

### 3. Git adapter layer

Назначение слоя:

- получить список локальных и удалённых веток;
- получить текущую ветку;
- получить ahead/behind;
- получить last commit;
- выполнить branch operations.

Требования к реализации:

- без shell-инъекций;
- только аргументы команд, без строковой склейки;
- все ошибки Git переводятся в нормализованные domain errors;
- интерфейс должен скрывать конкретную библиотеку.

Для MVP можно использовать `simple-git`, но за интерфейсом `GitRepository`.

### 4. Ephemeral cache layer

Хранить только временно:

- cached repository snapshots.

Не хранить:

- favorites;
- recent branches;
- last-used branches;
- branch metadata между перезапусками;
- отдельную пользовательскую модель веток.

Источники истины:

- Git repository state;
- VSCode workspace context;
- активный editor/repository context.

## Data Flow

1. UI запрашивает refresh.
2. Application layer просит Git adapter собрать snapshot.
3. Git adapter получает refs и метаданные из живого репозитория.
4. Application layer нормализует данные в дерево.
5. UI рендерит дерево и badges.
6. Пользователь запускает команду.
7. Application layer выполняет операцию.
8. После успешной операции идёт refresh.

## Refresh Strategy

Обновлять дерево:

- после выполнения любой команды;
- при изменении активного workspace/repository;
- по явному `Refresh`;
- по debounced watcher-событию для `.git`.

Критично не запускать несколько тяжёлых refresh одновременно. Нужна очередь или отмена устаревшего refresh.

Кэш не должен переживать restart extension host. Он нужен только для того, чтобы не дергать Git повторно в рамках одного цикла UI-обновления.

## Command Semantics

Зафиксировать поведение:

- `Checkout` работает по выбранной ветке.
- `Create Branch` создаёт новую локальную ветку из текущего `HEAD` или из выбранной базы, если это явно поддержано.
- `New Branch From Selected` создаёт новую локальную ветку от выбранной ветки.
- `Delete Branch` удаляет локальную ветку только после проверки, что это не текущая ветка.
- `Rename Branch` переименовывает только non-current local branch.
- `Merge into Current` и `Rebase Current onto Selected` работают только для локальных веток и должны проходить предварительную валидацию.
- `Checkout and Rebase Onto Selected` переключает на выбранную ветку и затем rebases предыдущую current branch onto selected.

## Implication of "No Persistent State"

Если не хранить ничего между сессиями, то:

- порядок и группировка должны строиться только из текущего Git состояния;
- любой "умный" индикатор должен вычисляться на лету или не показываться вовсе;
- UI должен оставаться корректным после restart без миграций и синхронизации состояния.

## Non-functional Risks

- Большие репозитории: список refs и вычисление stats могут стать дорогими.
- Частые refresh: легко получить лишние git-процессы.
- Разные git-версии: часть команд должна иметь fallback.
- Detached HEAD: нужен понятный empty/stateful view.
- Detached HEAD: нужен понятный stateful view без отдельного `HEAD` tree node.
- Remote ветки: требуется чёткая группировка по remote name.

## Mitigations

- кэшировать snapshot на короткий TTL;
- дебаунсить refresh;
- держать один active repository scan at a time;
- использовать нормализованные ошибки и понятные UI-сообщения;
- хранить логику группировки веток в одном месте.

## Migration Path

### MVP

- tree view;
- search;
- checkout;
- create branch;
- delete branch;
- pull/push;
- last commit;
- ahead/behind.

### Version 2

- merge;
- rebase;

### Version 3

- grouping by prefix;
- merge risk hints.

## Recommendation

Правильная архитектура здесь - небольшой модульный monolith внутри extension host с жёсткими границами между UI, use-cases и Git adapter.

Это даёт:

- низкую сложность запуска;
- обратимую эволюцию;
- возможность заменить реализацию Git без переписывания UI;
- понятный путь от MVP к production-ready версии.
