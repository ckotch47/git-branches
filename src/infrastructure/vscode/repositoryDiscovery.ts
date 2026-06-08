import { RelativePattern, Uri, workspace } from "vscode";
import { dirname } from "node:path";
import type { RepositoryContext } from "../../domain/repository";

function displayNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

async function hasGitMetadata(folderUri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(Uri.joinPath(folderUri, ".git"));
    return true;
  } catch {
    return false;
  }
}

function toRepositoryContext(rootPath: string): RepositoryContext {
  return {
    rootPath,
    displayName: displayNameFromPath(rootPath),
    isGitRepository: true,
  };
}

export async function discoverRepositories(): Promise<RepositoryContext[]> {
  const folders = workspace.workspaceFolders ?? [];
  const repositories: RepositoryContext[] = [];
  const seen = new Set<string>();

  for (const folder of folders) {
    if (await hasGitMetadata(folder.uri) && !seen.has(folder.uri.fsPath)) {
      seen.add(folder.uri.fsPath);
      repositories.push({
        rootPath: folder.uri.fsPath,
        displayName: displayNameFromPath(folder.name || folder.uri.fsPath),
        isGitRepository: true,
      });
    }

    const nestedGitFiles = await workspace.findFiles(
      new RelativePattern(folder, "**/.git"),
      "**/{node_modules,dist,out}/**",
      200,
    );

    for (const gitFile of nestedGitFiles) {
      const rootPath = dirname(gitFile.fsPath);

      if (seen.has(rootPath)) {
        continue;
      }

      seen.add(rootPath);
      repositories.push(toRepositoryContext(rootPath));
    }
  }

  return repositories;
}
