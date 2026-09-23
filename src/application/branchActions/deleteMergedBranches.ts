import { runGit } from "../../infrastructure/git/gitCli";

export interface CleanupResult {
  deleted: string[];
  skipped: string[];
}

export async function listMergedBranches(rootPath: string, currentBranch: string): Promise<string[]> {
  const output = await runGit(rootPath, ["branch", "--merged", currentBranch, "--format=%(refname:short)"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name && name !== currentBranch);
}

/**
 * Delete local branches fully merged into the current HEAD.
 * Safe-delete only (-d): unmerged branches land in `skipped`.
 */
export async function deleteMergedBranches(rootPath: string, currentBranch: string): Promise<CleanupResult> {
  const candidates = await listMergedBranches(rootPath, currentBranch);
  const result: CleanupResult = { deleted: [], skipped: [] };

  for (const name of candidates) {
    try {
      await runGit(rootPath, ["branch", "-d", name]);
      result.deleted.push(name);
    } catch {
      result.skipped.push(name);
    }
  }

  return result;
}
