# ADR Index: VSCode Branch Manager Extension

Документы по решению разнесены по темам:

- [Architecture](adr/architecture.md)
- [Manifest and View Placement](adr/manifest.md)
- [Commands and Context Keys](adr/commands-context.md)
- [Repository Discovery and Context](adr/repository-discovery.md)
- [Repository Selector UX](adr/repository-selector-ux.md)
- [Tree Model and Normalization](adr/tree-model.md)
- [Menu Placement](adr/menu-placement.md)
- [Module Boundaries](adr/module-boundaries.md)
- [Loading and Progress](adr/loading-progress.md)
- [Branch State Rules](adr/branch-state-rules.md)
- [SSH Auth and Passphrase](adr/ssh-auth.md)
- [Errors and UX](adr/errors-ux.md)
- [Refresh and Concurrency](adr/refresh.md)
- [QA Matrix](adr/qa-matrix.md)

Кратко:

- источник истины только Git + VSCode context;
- persistent state не хранится;
- один `TreeDataProvider` показывается в `Source Control` и в отдельном Activity Bar container;
- MVP строится вокруг управления ветками, без собственного graph/diff/merge UI.
