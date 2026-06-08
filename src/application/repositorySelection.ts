import { window } from "vscode";
import type { RepositoryContext } from "../domain/repository";

export async function selectRepository(
  repositories: RepositoryContext[],
): Promise<RepositoryContext | null> {
  if (repositories.length === 0) {
    return null;
  }

  if (repositories.length === 1) {
    return repositories[0] ?? null;
  }

  const selected = await window.showQuickPick(
    repositories.map((repository) => ({
      label: repository.displayName,
      description: repository.rootPath,
      repository,
    })),
    {
      title: "Select Git repository",
      placeHolder: "Choose repository for Git Branches",
      ignoreFocusOut: true,
    },
  );

  return selected?.repository ?? null;
}
