import { runGit } from "../infrastructure/git/gitCli";

export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

export function parseNameStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [statusRaw = "", ...rest] = trimmed.split("\t");
    const status = statusRaw.trim();

    if ((status.startsWith("R") || status.startsWith("C")) && rest.length >= 2) {
      files.push({ status: status[0] ?? status, path: (rest[1] ?? "").trim(), oldPath: (rest[0] ?? "").trim() });
    } else if (rest.length >= 1) {
      files.push({ status, path: (rest[0] ?? "").trim() });
    }
  }

  return files;
}

export interface FileStats {
  additions?: number;
  deletions?: number;
}

export function parseNumstat(output: string): { path: string; stats: FileStats }[] {
  const entries: { path: string; stats: FileStats }[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [addedRaw = "", deletedRaw = "", ...rest] = trimmed.split("\t");
    const path = rest.join("\t").trim();
    if (!path) {
      continue;
    }

    const stats: FileStats = {};
    if (addedRaw !== "-") {
      stats.additions = Number.parseInt(addedRaw, 10) || 0;
    }
    if (deletedRaw !== "-") {
      stats.deletions = Number.parseInt(deletedRaw, 10) || 0;
    }
    entries.push({ path, stats });
  }

  return entries;
}

/** Merge numstat entries into name-status files by order, with path fallback. */
export function attachStats(files: ChangedFile[], numstat: { path: string; stats: FileStats }[]): ChangedFile[] {
  return files.map((file, index) => {
    const byOrder = numstat[index];
    const entry =
      (byOrder && (byOrder.path === file.path || byOrder.path.endsWith(`=> ${file.path}`)) ? byOrder : undefined) ??
      numstat.find((candidate) => candidate.path === file.path || candidate.path.endsWith(`=> ${file.path}`));
    return entry ? { ...file, ...entry.stats } : file;
  });
}

async function numstatFor(rootPath: string, args: string[]): Promise<{ path: string; stats: FileStats }[]> {
  const output = await runGit(rootPath, ["show", "--pretty=", "--numstat", ...args]);
  return parseNumstat(output);
}

async function diffNumstat(rootPath: string, base: string, target: string): Promise<{ path: string; stats: FileStats }[]> {
  const output = await runGit(rootPath, ["diff", "--numstat", `${base}...${target}`]);
  return parseNumstat(output);
}

/** Files touched by one commit. For merges, shows changes vs the first parent. */
export async function listCommitFiles(rootPath: string, hash: string): Promise<ChangedFile[]> {
  const [statusOutput, stats] = await Promise.all([
    runGit(rootPath, ["show", "--pretty=", "--name-status", "-m", "--first-parent", hash]),
    numstatFor(rootPath, ["-m", "--first-parent", hash]).catch((): { path: string; stats: FileStats }[] => []),
  ]);
  return attachStats(parseNameStatus(statusOutput), stats);
}

/** Files changed in target compared to base (direction base...target). */
export async function listChangedFiles(rootPath: string, base: string, target: string): Promise<ChangedFile[]> {
  const [statusOutput, stats] = await Promise.all([
    runGit(rootPath, ["diff", "--name-status", `${base}...${target}`]),
    diffNumstat(rootPath, base, target).catch((): { path: string; stats: FileStats }[] => []),
  ]);
  return attachStats(parseNameStatus(statusOutput), stats);
}

export async function showFileAtRevision(rootPath: string, rev: string, filePath: string): Promise<string> {
  return runGit(rootPath, ["show", `${rev}:${filePath}`]);
}
