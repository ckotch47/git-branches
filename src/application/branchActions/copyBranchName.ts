import { env } from "vscode";

export async function copyBranchName(branchName: string): Promise<void> {
  await env.clipboard.writeText(branchName);
}
