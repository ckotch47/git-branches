# ADR: Tree Model and Normalization

## Goal

Зафиксировать, как raw Git данные превращаются в дерево для UI.

## Tree Shape

Базовое дерево:

- `HEAD`
- `Local`
- `Remote`

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

- Local branches показываются плоско и сортируются по branch name.
- Remote branches группируются по remote name.
- Внутри каждого remote branches сортируются по branch name.
- Если remote один, UI может показывать его без лишнего уровня вложенности, но логика группировки остается той же.
- `HEAD` показывает текущую ветку или detached HEAD state.
- Empty repo state не должен ломать tree shape.

## Filtering

Поиск работает по:

- branch name;
- display name;
- remote name.

Фильтр не должен изменять source data, только видимость узлов.

## Recommendation

Нормализация должна жить в одном месте, отдельно от UI и отдельно от git adapter. Это предотвратит расхождение логики между `scm` view и Activity Bar view.
