import { env } from "vscode";
import { runGit } from "../../infrastructure/git/gitCli";

export async function copyCommitSha(rootPath: string, ref: string): Promise<void> {
  const sha = (await runGit(rootPath, ["rev-parse", ref])).trim();
  await env.clipboard.writeText(sha);
}

export async function copyUpstreamName(upstream: string | undefined): Promise<boolean> {
  if (!upstream) {
    return false;
  }

  await env.clipboard.writeText(upstream);
  return true;
}
