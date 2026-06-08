import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";
import { ensureCleanWorkingTree } from "../../infrastructure/git/workingTree";

export async function rebaseCurrentOntoBranch(rootPath: string, target: BranchRef): Promise<void> {
  await ensureCleanWorkingTree(rootPath);
  await runGit(rootPath, ["rebase", target.name]);
}
