import { runGit } from "../../infrastructure/git/gitCli";

export async function abortRebase(rootPath: string): Promise<void> {
  await runGit(rootPath, ["rebase", "--abort"]);
}
