import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runGit } from "../../../src/infrastructure/git/gitCli.js";
import type { RepositoryContext } from "../../../src/domain/repository.js";

const EXCLUDED = new Set(["node_modules", "dist", "out"]);

export async function discoverRepositories(workspacePath: string): Promise<RepositoryContext[]> {
  const root = resolve(workspacePath);
  const found = new Map<string, RepositoryContext>();
  const addIfRepository = async (candidate: string): Promise<void> => {
    try {
      const top = (await runGit(candidate, ["rev-parse", "--show-toplevel"])).trim();
      const canonical = resolve(top);
      found.set(canonical, { rootPath: canonical, displayName: canonical.split(/[\\/]/).filter(Boolean).at(-1) ?? canonical, isGitRepository: true });
    } catch { /* not a repository */ }
  };

  await addIfRepository(root);
  let gitMetadataCount = 0;
  const visit = async (directory: string): Promise<void> => {
    if (gitMetadataCount >= 200) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (gitMetadataCount >= 200) break;
      if (entry.name === ".git") {
        gitMetadataCount++;
        await addIfRepository(dirname(join(directory, entry.name)));
      } else if (entry.isDirectory() && !EXCLUDED.has(entry.name)) {
        await visit(join(directory, entry.name));
      }
    }
  };
  await visit(root);
  return [...found.values()].sort((a, b) => a.rootPath.localeCompare(b.rootPath));
}

export function gitMetadataPath(repositoryRoot: string): string {
  return join(repositoryRoot, ".git");
}

export async function gitMetadataSignature(repositoryRoot: string): Promise<string> {
  const values: string[] = [];
  const locations = new Set<string>([gitMetadataPath(repositoryRoot)]);
  try { locations.add(resolve(repositoryRoot, (await runGit(repositoryRoot, ["rev-parse", "--git-dir"])).trim())); } catch { /* removed repository */ }
  try { locations.add(resolve(repositoryRoot, (await runGit(repositoryRoot, ["rev-parse", "--git-common-dir"])).trim())); } catch { /* older Git or removed repository */ }
  for (const metadata of locations) for (const candidate of [join(metadata, "HEAD"), join(metadata, "index"), join(metadata, "packed-refs"), join(metadata, "refs"), join(metadata, "logs", "HEAD")]) {
    try {
      const info = await stat(candidate);
      values.push(`${candidate}:${info.mtimeMs}:${info.size}`);
    } catch { values.push(`${candidate}:missing`); }
  }
  try {
    const head = (await runGit(repositoryRoot, ["rev-parse", "HEAD"])).trim();
    values.push(`head:${head}`);
  } catch { values.push("head:unknown"); }
  try {
    values.push(`refs:${await runGit(repositoryRoot, ["for-each-ref", "--format=%(refname)%00%(objectname)"])}`);
  } catch { values.push("refs:unknown"); }
  return values.join("|");
}
