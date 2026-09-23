import type { BranchRef } from "../../domain/branch";

export interface GitRefRecord {
  name: string;
  refname: string;
  head: string;
  upstream: string;
  objectName: string;
  committerDate: string;
  subject: string;
}

export function repositoryDisplayName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rootPath;
}

export function parseRecord(line: string): GitRefRecord | null {
  const parts = line.split("\0");
  if (parts.length < 7) {
    return null;
  }

  const [name = "", refname = "", head = "", upstream = "", objectName = "", committerDate = "", subject = ""] = parts;
  return { name, refname, head, upstream, objectName, committerDate, subject };
}

export function toBranchRef(record: GitRefRecord): BranchRef {
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
