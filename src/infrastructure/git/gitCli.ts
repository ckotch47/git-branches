import { execFile } from "node:child_process";
import { chmod, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { BranchManagerError } from "../../domain/errors";

const execFileAsync = promisify(execFile);

export interface GitCommandOptions {
  sshPassphrase?: string;
}

async function createAskPassHelper(): Promise<string> {
  const helperPath = join(tmpdir(), `branch-manager-askpass-${randomUUID()}.sh`);
  const script = `#!/bin/sh
printf '%s' "$BRANCH_MANAGER_SSH_PASSPHRASE"
`;

  await writeFile(helperPath, script, "utf8");
  await chmod(helperPath, 0o700);
  return helperPath;
}

export async function runGit(rootPath: string, args: string[], options: GitCommandOptions = {}): Promise<string> {
  let askPassHelper: string | null = null;
  const env = { ...process.env };

  if (options.sshPassphrase) {
    askPassHelper = await createAskPassHelper();
    env.SSH_ASKPASS = askPassHelper;
    env.GIT_ASKPASS = askPassHelper;
    env.SSH_ASKPASS_REQUIRE = "force";
    env.DISPLAY = env.DISPLAY || "1";
    env.BRANCH_MANAGER_SSH_PASSPHRASE = options.sshPassphrase;
  }

  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, ...args], { env });
    return stdout.toString();
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const message = error instanceof Error ? error.message : "Git operation failed";
    throw new BranchManagerError(message, "git_error", [stdout, stderr].filter(Boolean).join("\n"));
  } finally {
    if (askPassHelper) {
      await unlink(askPassHelper).catch(() => {});
    }
  }
}
