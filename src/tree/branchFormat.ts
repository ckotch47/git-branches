import type { BranchRef } from "../domain/branch";

export function collectRemoteNames(branches: BranchRef[]): string[] {
  return branches
    .filter((branch) => branch.isRemote)
    .map((branch) => branch.remoteName ?? branch.name.split("/")[0] ?? "origin")
    .filter((remoteName, index, list) => list.indexOf(remoteName) === index)
    .sort((left, right) => left.localeCompare(right));
}

export function shortRemoteBranchName(name: string): string {
  return name.split("/").slice(1).join("/") || name;
}

export function formatAheadBehind(branch: BranchRef): string {
  const parts: string[] = [];

  if (typeof branch.ahead === "number" && branch.ahead > 0) {
    parts.push(`↑${branch.ahead}`);
  }

  if (typeof branch.behind === "number" && branch.behind > 0) {
    parts.push(`↓${branch.behind}`);
  }

  return parts.join(" ");
}

export function buildBranchTooltip(branch: BranchRef, label: string): string {
  const lines: string[] = [`${label}`, `Full name: ${branch.name}`];

  if (branch.upstream) {
    lines.push(`Upstream: ${branch.upstream}`);
  }

  const aheadBehind = formatAheadBehind(branch);
  if (aheadBehind) {
    lines.push(`Status: ${aheadBehind}`);
  }

  if (branch.lastCommitMessage) {
    lines.push(`Last commit: ${branch.lastCommitMessage}`);
  }

  if (branch.lastCommitDate) {
    lines.push(`Updated: ${branch.lastCommitDate.toISOString()}`);
  }

  return lines.join("\n");
}

/** Current branch first, then by recency, then alphabetically. */
export function sortBranchesForView(branches: BranchRef[]): BranchRef[] {
  return [...branches].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }

    const leftTime = left.lastCommitDate?.getTime() ?? 0;
    const rightTime = right.lastCommitDate?.getTime() ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}
