# ADR: SSH Auth and Passphrase

## Goal

Зафиксировать поведение extension при Git operations, которые требуют SSH key passphrase или другого внешнего auth flow.

## Context

Git operations могут требовать:

- SSH key;
- SSH passphrase;
- system keychain;
- `ssh-agent`;
- Git credential helper;
- `askpass` flow.

Это внешний слой аутентификации, не зона ответственности extension.

## Decision

Extension не управляет ключами и passphrase напрямую.

## Rules

- Extension не хранит SSH key.
- Extension не хранит passphrase.
- Extension не пытается реализовать собственный prompt для SSH passphrase.
- Git commands должны идти через обычный OS/Git auth flow.
- Если Git запрашивает passphrase, это должно обрабатываться штатно Git/SSH, а не логикой extension.

## UX Behavior

- Если операция требует passphrase и auth проходит штатно, user flow должен продолжиться без дополнительных специальных экранов extension.
- Если auth неудачен, показать конкретную ошибку в духе "Git authentication failed" с возможным hint про SSH key / passphrase / agent.
- Не показывать misleading success state, если command фактически не завершилась.

## Error Mapping

Нужна отдельная нормализация для:

- permission denied;
- publickey failed;
- authentication failed;
- passphrase required but not provided;
- agent unavailable.

## Recommended Handling

- Use case layer получает ошибку от Git adapter.
- Git adapter нормализует SSH/auth failure в domain error.
- UI показывает короткое понятное сообщение.
- Подробности уходят в output channel или debug log.

## Security Notes

- Passphrase никогда не должен попадать в logs, telemetry или UI state.
- Extension не должен пытаться кешировать auth secrets.
- Любой auth prompt должен оставаться под контролем Git/SSH tooling.

## Recommendation

Для MVP это самый безопасный и предсказуемый подход: extension не вмешивается в SSH auth, а только корректно отображает успех или failure операции.
