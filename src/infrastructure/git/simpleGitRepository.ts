import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BranchRef } from "../../domain/branch";
import type { RepositoryContext } from "../../domain/repository";
import type { GitRepository } from "./gitRepository";

const execFileAsync = promisify(execFile);

interface GitRefRecord {
  name: string;
  refname: string;
  head: string;
  upstream: string;
  objectName: string;
  committerDate: string;
  subject: string;
}

function repositoryDisplayName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rootPath;
}

function parseRecord(line: string): GitRefRecord | null {
  const parts = line.split("\0");
  if (parts.length < 7) {
    return null;
  }

  const [name = "", refname = "", head = "", upstream = "", objectName = "", committerDate = "", subject = ""] = parts;
  return { name, refname, head, upstream, objectName, committerDate, subject };
}

function toBranchRef(record: GitRefRecord): BranchRef {
  const isRemote = record.refname.startsWith("refs/remotes/");
  const remoteName = isRemote ? record.name.split("/")[0] : undefined;

  return {
    name: record.name,
    displayName: record.name,
    kind: isRemote ? "remote" : "local",
    isCurrent: record.head === "*",
    isRemote,
    remoteName,
    upstream: record.upstream || undefined,
    lastCommitMessage: record.subject || undefined,
    lastCommitDate: record.committerDate ? new Date(record.committerDate) : undefined,
  };
}

async function getAheadBehind(rootPath: string, branchName: string, upstream: string): Promise<{ ahead?: number; behind?: number }> {
  if (!upstream) {
    return {};
  }

  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      rootPath,
      "rev-list",
      "--left-right",
      "--count",
      `${upstream}...${branchName}`,
    ]);

    const [behindRaw = "0", aheadRaw = "0"] = stdout.toString().trim().split(/\s+/);
    return {
      behind: Number.parseInt(behindRaw, 10) || 0,
      ahead: Number.parseInt(aheadRaw, 10) || 0,
    };
  } catch {
    return {};
  }
}

export class SimpleGitRepository implements GitRepository {
  async getRepositoryContext(rootPath: string): Promise<RepositoryContext | null> {
    return {
      rootPath,
      displayName: repositoryDisplayName(rootPath),
      isGitRepository: true,
    };
  }

  async getBranches(rootPath: string): Promise<BranchRef[]> {
    const { stdout } = await execFileAsync("git", [
      "-C",
      rootPath,
      "for-each-ref",
      "refs/heads",
      "refs/remotes",
      "--format=%(refname:short)%00%(refname)%00%(HEAD)%00%(upstream:short)%00%(objectname)%00%(committerdate:iso8601)%00%(contents:subject)",
    ]);

    const records = stdout
      .toString()
      .split("\n")
      .map(parseRecord)
      .filter((record): record is GitRefRecord => record !== null);

    const branches = await Promise.all(
      records.map(async (record) => {
        const branch = toBranchRef(record);

        if (!branch.isRemote && record.upstream) {
          const counts = await getAheadBehind(rootPath, record.name, record.upstream);
          branch.ahead = counts.ahead;
          branch.behind = counts.behind;
        }

        return branch;
      }),
    );

    return branches;
  }
}
