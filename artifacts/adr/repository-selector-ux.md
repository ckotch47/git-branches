# ADR: Repository Selector UX

## Goal

Зафиксировать UX для случая, когда в workspace доступно несколько Git repositories.

## Problem

Без явного выбора репозитория tree становится неоднозначным:

- непонятно, к какому repo относятся команды;
- смешиваются branch states;
- refresh может смотреть не в тот контекст;
- compare/checkout/delete легко начинают работать не на том объекте.

## Decision

Если найдено несколько repositories:

- показывать selector со списком доступных repositories;
- строить tree только для выбранного repository;
- менять repository context только через явное действие пользователя.

## Selector Behavior

- Selector должен быть доступен в view toolbar или в верхней части empty/summary area.
- Текущий выбранный repository должен быть явно виден.
- Если repository один, selector может быть скрыт.
- Если repositories нет, selector не показывается, вместо него empty state.

## User Flow

1. Пользователь открывает extension view.
2. Extension обнаруживает несколько repositories.
3. Пользователь выбирает нужный repository из списка.
4. Tree перестраивается под выбранный repository.
5. Все команды применяются только к выбранному repository.

## UX Rules

- Никакого автопереключения между repositories без действия пользователя.
- Последний выбор можно держать только transient в рамках текущей сессии, без persistent state.
- При смене workspace selector должен пересчитываться заново.
- Если выбранный repository становится недоступен, показать empty state и предложить выбрать другой.

## Recommendation

Это минимальный и безопасный способ поддержать multi-repo без скрытой магии и без размывания контекста команд.
