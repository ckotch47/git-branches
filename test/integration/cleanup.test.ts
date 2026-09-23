import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteMergedBranches, listMergedBranches } from "../../src/application/branchActions/deleteMergedBranches";
import { listGoneBranches, pruneGoneBranches } from "../../src/application/branchActions/pruneGoneBranches";

const exec = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args]);
  return stdout.toString();
}

async function commit(dir: string, message: string): Promise<void> {
  const { appendFileSync, existsSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const file = join(dir, "f.txt");
  if (!existsSync(file)) {
    writeFileSync(file, `${message}\n`);
  } else {
    appendFileSync(file, `${message}\n`);
  }
  await git(dir, "add", ".");
  await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", message);
}

describe("branch cleanup (real git)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-clean-"));
    await git(dir, "init", "-b", "main", "-q");
    await commit(dir, "init");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists and deletes only merged branches", async () => {
    await git(dir, "checkout", "-qb", "merged-one");
    await commit(dir, "m1");
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "merged-one");
    await git(dir, "checkout", "-qb", "unmerged");
    await commit(dir, "u1");
    await git(dir, "checkout", "-q", "main");

    assert.deepEqual(await listMergedBranches(dir, "main"), ["merged-one"]);
    const result = await deleteMergedBranches(dir, "main");
    assert.deepEqual(result.deleted, ["merged-one"]);
    assert.deepEqual(result.skipped, []);
    assert.match(await git(dir, "branch", "--list", "unmerged"), /unmerged/);
  });

  it("prunes branches with gone upstream", async () => {
    const remote = mkdtempSync(join(tmpdir(), "gb-clean-remote-"));
    try {
      await git(remote, "init", "--bare", "-q");
      await git(dir, "remote", "add", "origin", remote);
      await git(dir, "push", "-q", "-u", "origin", "main");
      await git(dir, "checkout", "-qb", "doomed");
      await commit(dir, "d1");
      await git(dir, "push", "-q", "-u", "origin", "doomed");
      await git(dir, "checkout", "-q", "main");
      await git(dir, "push", "-q", "origin", "--delete", "doomed");
      await git(dir, "fetch", "-q", "--prune", "origin");

      assert.deepEqual(await listGoneBranches(dir), ["doomed"]);
      const result = await pruneGoneBranches(dir);
      assert.deepEqual(result.deleted, ["doomed"]);
      assert.deepEqual(await listGoneBranches(dir), []);
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });

  it("reports empty cleanup", async () => {
    assert.deepEqual(await listMergedBranches(dir, "main"), []);
    assert.deepEqual(await listGoneBranches(dir), []);
  });
});
