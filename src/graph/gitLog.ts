import { runGit } from "../infrastructure/git/gitCli";

export interface RawGraphCommit {
  hash: string;
  parents: string[];
  /** Raw %(D) decoration string, empty when none. */
  decorations: string;
  author: string;
  authorEmail: string;
  date: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
}

export interface GraphRef {
  name: string;
  kind: "head" | "local" | "remote" | "tag";
}

export interface GraphCommit extends RawGraphCommit {
  refs: GraphRef[];
  isHead: boolean;
  shortHash: string;
  lane: number;
  columns: number[];
  links: { from: number; to: number }[];
}

const FIELD_SEP = "\0";
const RECORD_SEP = "\x1e";
// NOTE: the pretty format must use %x00/%x1e placeholders — raw NUL bytes
// in argv are rejected by Node child_process.
const PRETTY_FORMAT = "%H%x00%P%x00%D%x00%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd%x00%s%x1e";
const DEFAULT_LIMIT = 500;

export function parseLogRecords(output: string): RawGraphCommit[] {
  return output
    .split(RECORD_SEP)
    .map((record) => record.replace(/^\n+/, "").trim())
    .filter(Boolean)
    .map((record) => {
      const [
        hash = "",
        parentsRaw = "",
        decorations = "",
        author = "",
        authorEmail = "",
        date = "",
        committer = "",
        committerEmail = "",
        committerDate = "",
        subject = "",
      ] = record.split(FIELD_SEP);
      return {
        hash: hash.trim(),
        parents: parentsRaw.trim().split(/\s+/).filter(Boolean),
        decorations: decorations.trim(),
        author: author.trim(),
        authorEmail: authorEmail.trim(),
        date: date.trim(),
        committer: committer.trim(),
        committerEmail: committerEmail.trim(),
        committerDate: committerDate.trim(),
        subject: subject.trim(),
      };
    })
    .filter((commit) => commit.hash.length > 0);
}

export function parseDecorations(decorations: string, remoteNames: string[] = []): { refs: GraphRef[]; isHead: boolean } {
  const refs: GraphRef[] = [];
  let isHead = false;

  if (!decorations) {
    return { refs, isHead };
  }

  for (const part of decorations.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (part === "HEAD") {
      isHead = true;
      continue;
    }

    if (part.startsWith("HEAD -> ")) {
      isHead = true;
      refs.push({ name: part.slice("HEAD -> ".length), kind: "head" });
      continue;
    }

    if (part.startsWith("tag: ")) {
      refs.push({ name: part.slice("tag: ".length), kind: "tag" });
      continue;
    }

    const firstSegment = part.split("/")[0] ?? "";
    if (part.includes("/") && remoteNames.includes(firstSegment)) {
      refs.push({ name: part, kind: "remote" });
      continue;
    }

    refs.push({ name: part, kind: "local" });
  }

  return { refs, isHead };
}

export async function getRemoteNames(rootPath: string): Promise<string[]> {
  try {
    const output = await runGit(rootPath, ["remote"]);
    return output.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
export async function collectGraphCommits(
  rootPath: string,
  options: { limit?: number; onlyRef?: string } = {},
): Promise<RawGraphCommit[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const range = options.onlyRef ? [options.onlyRef] : ["--all"];
  const output = await runGit(rootPath, [
    "log",
    "--topo-order",
    "--date=iso",
    `--pretty=format:${PRETTY_FORMAT}`,
    "-n",
    String(limit),
    ...range,
  ]);
  return parseLogRecords(output);
}
