import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignLanes } from "../../src/graph/lanes";
import { parseDecorations, parseLogRecords } from "../../src/graph/gitLog";
import { parseNameStatus, parseNumstat, attachStats } from "../../src/graph/compare";
import type { RawGraphCommit } from "../../src/graph/gitLog";

function raw(hash: string, parents: string[] = [], decorations = ""): RawGraphCommit {
  return {
    hash,
    parents,
    decorations,
    author: "a",
    authorEmail: "a@x",
    date: "d",
    committer: "a",
    committerEmail: "a@x",
    committerDate: "d",
    subject: hash,
  };
}

describe("assignLanes", () => {
  it("keeps a linear history on one lane", () => {
    const placed = assignLanes([raw("c3", ["c2"]), raw("c2", ["c1"]), raw("c1")]);
    assert.deepEqual(placed.map((c) => c.lane), [0, 0, 0]);
    assert.deepEqual(placed[0]?.links, []);
    assert.ok((placed[0]?.columns.length ?? 0) >= 1);
  });

  it("opens a lane for the merged branch and links back", () => {
    // c4 merges c3 (first parent) and c2b (side branch tip).
    const placed = assignLanes([
      raw("c4", ["c3", "c2b"]),
      raw("c3", ["c1"]),
      raw("c2b", ["c1"]),
      raw("c1"),
    ]);
    assert.equal(placed[0]?.lane, 0);
    assert.equal(placed[0]?.links.length, 1);
    assert.equal(placed[0]?.links[0]?.from, 0);
    const sideLane = placed[0]?.links[0]?.to ?? -1;
    assert.notEqual(sideLane, 0);
    assert.equal(placed[2]?.lane, sideLane);
  });

  it("every commit has its lane inside its columns", () => {
    const placed = assignLanes([
      raw("m", ["a", "b"]),
      raw("a", ["r"]),
      raw("b", ["r"]),
      raw("r"),
    ]);
    for (const commit of placed) {
      assert.ok(commit.columns.includes(commit.lane), commit.hash);
      for (const link of commit.links) {
        assert.ok(commit.columns.includes(link.to), `${commit.hash} link target`);
      }
    }
  });
});

describe("parseDecorations", () => {
  it("detects head, branches, remotes and tags", () => {
    const { refs, isHead } = parseDecorations("HEAD -> main, origin/main, tag: v1, feature/x", ["origin"]);
    assert.equal(isHead, true);
    assert.deepEqual(
      refs.map((r) => `${r.kind}:${r.name}`),
      ["head:main", "remote:origin/main", "tag:v1", "local:feature/x"],
    );
  });

  it("handles detached HEAD and empty input", () => {
    assert.equal(parseDecorations("HEAD").isHead, true);
    assert.deepEqual(parseDecorations("HEAD").refs, []);
    assert.deepEqual(parseDecorations("").refs, []);
  });
});

describe("parseNumstat and attachStats", () => {
  it("parses additions, deletions and binary files", () => {
    assert.deepEqual(parseNumstat("9\t1\ta.txt\n-\t-\tbin.dat\n"), [
      { path: "a.txt", stats: { additions: 9, deletions: 1 } },
      { path: "bin.dat", stats: {} },
    ]);
  });

  it("merges stats into files by order", () => {
    const files = attachStats(
      [
        { status: "M", path: "a.txt" },
        { status: "A", path: "b.txt" },
      ],
      [
        { path: "a.txt", stats: { additions: 2, deletions: 0 } },
        { path: "b.txt", stats: { additions: 5, deletions: 0 } },
      ],
    );
    assert.deepEqual(files[0], { status: "M", path: "a.txt", additions: 2, deletions: 0 });
  });
});
describe("parseNameStatus", () => {
  it("parses modified/added/deleted and renames", () => {
    assert.deepEqual(parseNameStatus("M\ta.txt\nA\tb.txt\nD\tc.txt\nR100\told.txt\tnew.txt\n"), [
      { status: "M", path: "a.txt" },
      { status: "A", path: "b.txt" },
      { status: "D", path: "c.txt" },
      { status: "R", path: "new.txt", oldPath: "old.txt" },
    ]);
  });
});
describe("parseLogRecords", () => {
  it("splits records and fields", () => {
    const output = [
      ["abc", "p1 p2", "HEAD -> main", "Ann", "ann@x", "2026-01-01", "Ann", "ann@x", "2026-01-01", "subj"].join("\0"),
      ["def", "", "", "Bob", "bob@x", "2026-01-02", "Bob", "bob@x", "2026-01-02", "other"].join("\0"),
    ].join("\x1e");
    const records = parseLogRecords(output);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0]?.parents, ["p1", "p2"]);
    assert.equal(records[0]?.authorEmail, "ann@x");
    assert.equal(records[0]?.committer, "Ann");
    assert.equal(records[1]?.hash, "def");
  });
});
