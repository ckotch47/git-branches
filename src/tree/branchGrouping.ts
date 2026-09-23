import type { BranchRef } from "../domain/branch";

export interface PrefixGroup {
  prefix: string;
  branches: BranchRef[];
}

/** First path segment, e.g. "feature" for "feature/login". Null when flat. */
export function prefixOf(name: string): string | null {
  const index = name.indexOf("/");
  if (index <= 0) {
    return null;
  }
  return name.slice(0, index);
}

export function groupLocalBranches(branches: BranchRef[]): PrefixGroup[] {
  const groups = new Map<string, BranchRef[]>();

  for (const branch of branches) {
    if (branch.isRemote) {
      continue;
    }
    const prefix = prefixOf(branch.displayName);
    if (!prefix) {
      continue;
    }
    const list = groups.get(prefix);
    if (list) {
      list.push(branch);
    } else {
      groups.set(prefix, [branch]);
    }
  }

  return [...groups.entries()]
    .map(([prefix, list]) => ({ prefix, branches: list }))
    .sort((left, right) => left.prefix.localeCompare(right.prefix));
}
