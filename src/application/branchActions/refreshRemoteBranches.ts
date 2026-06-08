import { runGit } from "../../infrastructure/git/gitCli";

export async function refreshRemoteBranches(rootPath: string): Promise<void> {
  await runGit(rootPath, ["fetch", "--all", "--prune"]);
}
