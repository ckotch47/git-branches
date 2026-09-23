# ADR: Tree Model and Normalization

## Goal

Зафиксировать, как raw Git данные превращаются в дерево для UI.

## Tree Shape

Базовое дерево:

- `Local`
- remote groups by name

Дополнительные разделы MVP не требуют persistent state, поэтому `Favorites` и `Recent` исключены.

## Normalization Rules

- `git branch` дает local branches.
- `git branch -r` дает remote refs.
- `git branch --show-current` или эквивалент нужен для current branch.
- `git log -1` или эквивалент нужен для last commit metadata.
- ahead/behind вычисляется только для реальных refs, не для псевдо-узлов.

## Branch Node Fields

Каждый node должен содержать минимум:

- `name`
- `displayName`
- `kind`
- `isCurrent`
- `isRemote`
- `remoteName`
- `ahead`
- `behind`
- `lastCommitMessage`
- `lastCommitDate`
- `canCheckout`
- `canDelete`
- `canMerge`
- `canRebase`

## Grouping Rules

- Local branches: current branch first, then by last-commit recency, then alphabetically (отклонение от исходного «только алфавит» — current должен быть виден сразу).
- Remote branches группируются по remote name.
- Внутри каждого remote branches сортируются по branch name.
- Если remote один, UI может показывать его без лишнего уровня вложенности, но логика группировки остается той же.
- Local branches show current branch inline with a badge or suffix.
- Detached HEAD is represented by message/state, not by a separate `HEAD` tree node.
- Empty repo state не должен ломать tree shape.
- Prefix grouping (опция, default off): `Local` показывает группы `feature/`, `bugfix/` + плоские ветки без префикса; вычисляется на лету, не хранится.

## Filtering

Поиск работает по:

- branch name;
- display name;
- remote name (по короткому имени без префикса remote).

Фильтр не должен изменять source data, только видимость узлов. Current branch всегда видим при любом фильтре. Пустой результат — message-узел, а не пустое дерево. Активный фильтр виден в message view.

## Recommendation

Нормализация должна жить в одном месте, отдельно от UI и отдельно от git adapter. Это предотвратит расхождение логики между `scm` view и Activity Bar view.
