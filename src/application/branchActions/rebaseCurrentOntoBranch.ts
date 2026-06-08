import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";

export async function rebaseCurrentOntoBranch(rootPath: string, target: BranchRef): Promise<void> {
  await runGit(rootPath, ["rebase", target.name]);
}
