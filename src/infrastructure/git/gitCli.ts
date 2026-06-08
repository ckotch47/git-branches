import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BranchManagerError } from "../../domain/errors";

const execFileAsync = promisify(execFile);

export async function runGit(rootPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, ...args]);
    return stdout.toString();
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const message = error instanceof Error ? error.message : "Git operation failed";
    throw new BranchManagerError(message, "git_error", [stdout, stderr].filter(Boolean).join("\n"));
  }
}
