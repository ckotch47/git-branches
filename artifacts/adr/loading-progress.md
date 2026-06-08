# ADR: Loading and Progress

## Goal

Зафиксировать поведение loading и progress при refresh и командах.

## Principles

- UI не должен выглядеть зависшим.
- Долгие операции должны быть видимы пользователю.
- Progress не должен шуметь при быстрых последовательных refresh.

## Refresh Loading

При refresh:

- если операция короткая, достаточно subtle loading state;
- если операция заметно долгая, нужен progress indicator;
- tree не должен очищаться до получения нового snapshot, если это не empty state по смыслу.

## Command Loading

Для команд:

- checkout;
- create branch;
- delete branch;
- pull;
- push;
- merge;
- rebase;

нужен видимый progress или busy state на время выполнения.

## UX Rules

- Не показывать несколько конкурирующих индикаторов одновременно без причины.
- Если команда запускает refresh, progress должен восприниматься как одна связная операция.
- Если refresh отменён как устаревший, UI должен просто перейти к новому актуальному состоянию.

## Output Channel

Output channel можно использовать только для debug details и diagnostics, не как основной индикатор активности.

## Recommendation

Для MVP достаточно простого progress API VSCode и одного централизованного механизма, который показывает состояние busy на refresh и branch actions.
