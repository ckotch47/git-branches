# ADR: Compare Semantics

## Goal

Зафиксировать, что именно означает compare branches в контексте этой extension.

## Decision

Compare всегда открывает встроенный VSCode diff viewer.

## Direction

Для команды `Compare with Current`:

- left side: current branch;
- right side: selected branch.

Это правило должно оставаться неизменным, чтобы UI и Git layer не расходились в трактовке результата.

## Scope

Compare работает только с:

- current local branch;
- selected branch that exists in current repository context.

Не сравниваем:

- `HEAD` pseudo-node;
- empty repository state;
- неразрешённый repository context.

## Ref Resolution

Перед compare нужно:

- убедиться, что обе ветки существуют;
- убедиться, что selected branch не равна current branch;
- убедиться, что обе стороны находятся в текущем repository context.

## UI Behavior

- Команда открывает встроенный diff viewer.
- Tree view после compare не должен менять selection.
- Compare не должен запускать destructive action confirmation.
- Ошибка compare должна быть отдельной от checkout/delete ошибок.

## Git Semantics

Для compare нужно использовать явные refs, а не неявные эвристики.

Нужно избегать:

- сравнения по имени без полного resolution;
- смешения local и remote ref без явного выбора;
- неявного использования upstream вместо selected ref.

## Recommendation

Ориентир сравнения должен быть простым и неизменным: current слева, selected справа, встроенный diff viewer без собственной реализации.
