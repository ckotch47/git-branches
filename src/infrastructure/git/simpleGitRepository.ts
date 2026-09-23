import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BranchRef } from "../../domain/branch";
import type { RepositoryContext } from "../../domain/repository";
import type { GitRepository } from "./gitRepository";
import { parseRecord, repositoryDisplayName, toBranchRef } from "./gitParser";
import type { GitRefRecord } from "./gitParser";
import { mapWithConcurrency } from "../../shared/utils";

const execFileAsync = promisify(execFile);

/** Max parallel `git rev-list` probes; keeps big repos from forking hundreds of processes. */
const AHEAD_BEHIND_CONCURRENCY = 8;

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

    const branches = await mapWithConcurrency(records, AHEAD_BEHIND_CONCURRENCY, async (record) => {
      const branch = toBranchRef(record);

      if (!branch.isRemote && record.upstream) {
        const counts = await getAheadBehind(rootPath, record.name, record.upstream);
        branch.ahead = counts.ahead;
        branch.behind = counts.behind;
      }

      return branch;
    });

    return branches;
  }

  async getRemotes(rootPath: string): Promise<string[]> {
    const { stdout } = await execFileAsync("git", [
      "-C",
      rootPath,
      "remote",
    ]);

    return stdout
      .toString()
      .split("\n")
      .map((remote) => remote.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }
}
