import { runGit } from "../../infrastructure/git/gitCli";

export async function abortMerge(rootPath: string): Promise<void> {
  await runGit(rootPath, ["merge", "--abort"]);
}
