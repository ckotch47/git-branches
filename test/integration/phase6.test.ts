import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupLocalBranches, prefixOf } from "../../src/tree/branchGrouping";
import { describeMerge } from "../../src/application/branchActions/mergeRisk";
import { assignLanes } from "../../src/graph/lanes";
import { collectGraphCommits, getRemoteNames } from "../../src/graph/gitLog";
import { listChangedFiles, listCommitFiles } from "../../src/graph/compare";
import type { BranchRef } from "../../src/domain/branch";

const exec = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args]);
  return stdout.toString();
}

function branch(name: string): BranchRef {
  return { name, displayName: name, kind: "local", isCurrent: false, isRemote: false };
}

describe("prefixOf", () => {
  it("extracts the first segment", () => {
    assert.equal(prefixOf("feature/login"), "feature");
    assert.equal(prefixOf("a/b/c"), "a");
    assert.equal(prefixOf("main"), null);
    assert.equal(prefixOf("/weird"), null);
  });
});

describe("groupLocalBranches", () => {
  it("groups by prefix, skips remotes and flat names", () => {
    const groups = groupLocalBranches([
      branch("feature/b"),
      branch("feature/a"),
      branch("bugfix/x"),
      branch("main"),
      { ...branch("origin/feature/y"), kind: "remote", isRemote: true, remoteName: "origin" },
    ]);
    assert.deepEqual(
      groups.map((g) => g.prefix),
      ["bugfix", "feature"],
    );
    assert.deepEqual(
      groups.find((g) => g.prefix === "feature")?.branches.map((b) => b.name),
      ["feature/b", "feature/a"],
    );
  });
});

describe("describeMerge (real git)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-merge-"));
    await git(dir, "init", "-b", "main", "-q");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports already-merged and diverged states", async () => {
    await git(dir, "checkout", "-qb", "feat");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "f1");
    await git(dir, "checkout", "-q", "main");
    assert.match((await describeMerge(dir, "feat", "main")) ?? "", /1 ahead, 0 behind main/);
    await git(dir, "merge", "-q", "feat");
    assert.equal(await describeMerge(dir, "feat", "main"), "already merged into target");
  });

  it("returns null for unknown refs", async () => {
    assert.equal(await describeMerge(dir, "nope", "main"), null);
  });
});

describe("graph backend (real git)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-graph-"));
    await git(dir, "init", "-b", "main", "-q");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("collects a merge history with lanes and refs", async () => {
    await git(dir, "checkout", "-qb", "feature");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "feat1");
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "--no-ff", "feature", "-m", "merge feature");

    const raw = await collectGraphCommits(dir, {});
    assert.equal(raw.length, 3);
    const placed = assignLanes(raw, await getRemoteNames(dir));
    const merge = placed[0];
    assert.ok(merge);
    assert.equal(merge.links.length, 1);
    assert.deepEqual(
      merge.refs.map((r) => `${r.kind}:${r.name}`),
      ["head:main"],
    );
    const featureTip = placed.find((c) => c.subject === "feat1");
    assert.ok(featureTip);
    assert.deepEqual(
      featureTip.refs.map((r) => `${r.kind}:${r.name}`),
      ["local:feature"],
    );
    for (const commit of placed) {
      assert.ok(commit.columns.includes(commit.lane));
    }
  });

  it("lists commit and range files", async () => {
    const { writeFileSync, appendFileSync } = await import("node:fs");
    writeFileSync(join(dir, "a.txt"), "v1\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "add a");
    appendFileSync(join(dir, "a.txt"), "v2\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "change a");

    const head = (await git(dir, "rev-parse", "HEAD")).trim();
    const files = await listCommitFiles(dir, head);
    assert.deepEqual(files.map((f) => `${f.status}:${f.path}`), ["M:a.txt"]);
    const range = await listChangedFiles(dir, "HEAD~2", "HEAD");
    assert.ok(range.some((f) => f.path === "a.txt"));
  });
});
