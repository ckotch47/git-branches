import { runGit } from "../../infrastructure/git/gitCli";
import type { CleanupResult } from "./deleteMergedBranches";

export async function listGoneBranches(rootPath: string): Promise<string[]> {
  const output = await runGit(rootPath, [
    "for-each-ref",
    "--format=%(refname:short)%00%(upstream:track)",
    "refs/heads",
  ]);

  return output.split("\n").flatMap((line) => {
    const [name = "", track = ""] = line.split("\0");
    const trimmed = name.trim();
    return track.includes("[gone]") && trimmed ? [trimmed] : [];
  });
}

/**
 * Delete local branches whose upstream is gone (e.g. merged via PR and
 * deleted on the remote). Uses -D: gone-upstream branches are usually NOT
 * fully merged locally (squash/rebase merges), so -d would skip everything.
 * Callers must confirm with the branch names listed.
 */
export async function pruneGoneBranches(rootPath: string): Promise<CleanupResult> {
  const candidates = await listGoneBranches(rootPath);
  const result: CleanupResult = { deleted: [], skipped: [] };

  for (const name of candidates) {
    try {
      await runGit(rootPath, ["branch", "-D", name]);
      result.deleted.push(name);
    } catch {
      result.skipped.push(name);
    }
  }

  return result;
}
