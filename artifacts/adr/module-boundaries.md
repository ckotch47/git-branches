# ADR: Module Boundaries

## Goal

Зафиксировать границы ответственности между частями extension.

## Modules

### Activation

Отвечает за:

- регистрацию views;
- регистрацию commands;
- wiring dependency graph;
- initial repository discovery hooks.

Не должен содержать:

- git parsing;
- tree normalization;
- branch action logic.

### Repository Context

Отвечает за:

- обнаружение доступных repositories;
- выбор active repository;
- реакцию на смену workspace;
- отдачу текущего repository context.

Не должен содержать:

- UI rendering;
- execution of branch commands.

### Git Adapter

Отвечает за:

- чтение refs;
- чтение current branch;
- чтение commit metadata;
- выполнение git commands.

Не должен содержать:

- view-specific logic;
- command visibility;
- UX decisions.

### Snapshot Builder

Отвечает за:

- нормализацию raw git data;
- grouping;
- filtering input for tree;
- сборку tree model.

Не должен содержать:

- git command execution;
- view registration;
- repository discovery.

### Use Case Layer

Отвечает за:

- orchestration of commands;
- validation before actions;
- refresh control;
- context key updates.

Не должен содержать:

- raw git parsing;
- direct view rendering;
- persistent state management.

### UI Layer

Отвечает за:

- TreeView rendering;
- view toolbar;
- tree item interactions;
- selection handling.

Не должен содержать:

- git calls;
- normalization logic;
- command semantics.

## Dependency Direction

Правильное направление зависимостей:

`UI -> Use Cases -> Git Adapter`

и отдельно:

`Repository Context -> Use Cases`

`Snapshot Builder <- Git Adapter`

Не допускается:

- UI calling Git Adapter directly;
- Git Adapter importing UI modules;
- Snapshot Builder knowing about VSCode commands.

## Recommendation

Если нужно что-то изменить в поведении, сначала менять use case или snapshot layer, а не UI. Это минимизирует дублирование и регрессии.
