import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { showFileAtRevision } from "../../../src/graph/compare.js";

/** Copy using OSC 52 (supported by modern terminal emulators), then native clipboard tools. */
export async function copyText(value: string): Promise<string> {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  if (process.stdout.isTTY) process.stdout.write(`\u001b]52;c;${encoded}\u0007`);
  const candidates = platform() === "darwin" ? [["pbcopy", []]] : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [command, args] of candidates as [string, string[]][]) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
        child.once("error", reject);
        child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
        child.stdin.end(value);
      });
      return `Copied ${value.length} characters to clipboard.`;
    } catch { /* try next terminal integration */ }
  }
  return "Sent clipboard data using terminal OSC 52. If your terminal blocks it, use a clipboard-enabled terminal.";
}

export async function showFile(rootPath: string, revision: string, filePath: string): Promise<string> {
  return showFileAtRevision(rootPath, revision, filePath);
}

/** Terminal equivalent of VS Code's content diff, including added/deleted files. */
export async function showFileDiff(rootPath: string, leftRef: string, rightRef: string, filePath: string): Promise<string> {
  const [left, right] = await Promise.all([
    showFileAtRevision(rootPath, leftRef, filePath).catch(() => ""),
    showFileAtRevision(rootPath, rightRef, filePath).catch(() => ""),
  ]);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "git-branches-diff-"));
  const leftPath = join(temporaryDirectory, "left");
  const rightPath = join(temporaryDirectory, "right");
  try {
    await Promise.all([writeFile(leftPath, left, { mode: 0o600 }), writeFile(rightPath, right, { mode: 0o600 })]);
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("git", ["diff", "--no-index", "--no-ext-diff", leftPath, rightPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0 && code !== 1) return reject(new Error(stderr || `git diff exited ${code}`));
        const output = stdout
          .replaceAll(`a/${leftPath}`, `a/${leftRef}:${filePath}`)
          .replaceAll(`b/${rightPath}`, `b/${rightRef}:${filePath}`);
        resolve(output || "Files have identical content.");
      });
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
