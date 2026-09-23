import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertValidBranchName } from "../../src/infrastructure/git/branchName";
import { ensureCleanWorkingTree, isWorkingTreeDirty, stashPop, stashPush } from "../../src/infrastructure/git/workingTree";
import { normalizeGitError } from "../../src/infrastructure/git/gitErrors";
import { BranchManagerError } from "../../src/domain/errors";

const exec = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args]);
  return stdout.toString();
}

describe("branch name validation", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-name-"));
    await git(dir, "init", "-b", "main", "-q");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts normal names", async () => {
    await assertValidBranchName(dir, "feature/login-2");
    await assertValidBranchName(dir, "  spaced  ");
  });

  it("rejects empty and git-invalid names", async () => {
    await assert.rejects(assertValidBranchName(dir, "   "), (err: unknown) => {
      assert.equal((err as BranchManagerError).code, "invalid_branch_name");
      return true;
    });
    await assert.rejects(assertValidBranchName(dir, "bad name!"), (err: unknown) => {
      assert.equal((err as BranchManagerError).code, "invalid_branch_name");
      return true;
    });
    await assert.rejects(assertValidBranchName(dir, "a..b"), (err: unknown) => {
      assert.equal((err as BranchManagerError).code, "invalid_branch_name");
      return true;
    });
  });
});

describe("working tree stash flow", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-stash-"));
    await git(dir, "init", "-b", "main", "-q");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects clean and dirty states", async () => {
    assert.equal(await isWorkingTreeDirty(dir), false);
    await ensureCleanWorkingTree(dir);
    writeFileSync(join(dir, "dirty.txt"), "x");
    assert.equal(await isWorkingTreeDirty(dir), true);
    await assert.rejects(ensureCleanWorkingTree(dir), (err: unknown) => {
      assert.equal((err as BranchManagerError).code, "git_dirty_worktree");
      return true;
    });
  });

  it("stashes and pops roundtrip", async () => {
    assert.equal(await stashPush(dir), false);
    writeFileSync(join(dir, "dirty.txt"), "x");
    assert.equal(await stashPush(dir), true);
    assert.equal(await isWorkingTreeDirty(dir), false);
    await stashPop(dir);
    assert.equal(await isWorkingTreeDirty(dir), true);
  });
});

describe("normalizeGitError passthrough", () => {
  it("keeps domain codes intact", () => {
    const dirty = new BranchManagerError("dirty", "git_dirty_worktree");
    assert.equal(normalizeGitError(dirty).code, "git_dirty_worktree");
    const invalid = new BranchManagerError("bad", "invalid_branch_name");
    assert.equal(normalizeGitError(invalid).code, "invalid_branch_name");
  });
});
