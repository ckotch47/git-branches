import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";
import { ensureCleanWorkingTree } from "../../infrastructure/git/workingTree";

export async function mergeBranch(rootPath: string, target: BranchRef): Promise<void> {
  await ensureCleanWorkingTree(rootPath);
  await runGit(rootPath, ["merge", target.name]);
}
