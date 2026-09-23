import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteBranch, isNotFullyMergedError } from "../../src/application/branchActions/deleteBranch";
import { resetBranchToRemote } from "../../src/application/branchActions/resetBranchToRemote";
import { pushBranch } from "../../src/application/branchActions/pushBranch";
import { abortMerge } from "../../src/application/branchActions/abortMerge";
import { abortRebase } from "../../src/application/branchActions/abortRebase";
import { SimpleGitRepository } from "../../src/infrastructure/git/simpleGitRepository";

const exec = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args]);
  return stdout.toString();
}

async function commit(dir: string, message: string, content: string): Promise<void> {
  const { writeFileSync, appendFileSync, existsSync } = await import("node:fs");
  const file = join(dir, "f.txt");
  if (!existsSync(file)) {
    writeFileSync(file, content);
  } else {
    appendFileSync(file, content);
  }
  await git(dir, "add", ".");
  await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", message);
}

describe("branch actions (real git)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gb-test-"));
    await git(dir, "init", "-b", "main", "-q");
    await commit(dir, "init", "a\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("deleteBranch -d removes merged branch, refuses unmerged, -D forces", async () => {
    await git(dir, "checkout", "-qb", "merged");
    await commit(dir, "m1", "b\n");
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "merged");
    await deleteBranch(dir, "merged");
    assert.match(await git(dir, "branch", "--list", "merged"), /^\s*$/);

    await git(dir, "checkout", "-qb", "unmerged");
    await commit(dir, "u1", "c\n");
    await git(dir, "checkout", "-q", "main");
    await assert.rejects(deleteBranch(dir, "unmerged"), (err: unknown) => {
      assert.ok(isNotFullyMergedError(err));
      return true;
    });
    await deleteBranch(dir, "unmerged", true);
    assert.match(await git(dir, "branch", "--list", "unmerged"), /^\s*$/);
  });

  it("resetBranchToRemote resets diverged local to remote", async () => {
    const remote = mkdtempSync(join(tmpdir(), "gb-remote-"));
    try {
      await git(remote, "init", "--bare", "-q");
      await git(dir, "remote", "add", "origin", remote);
      await git(dir, "push", "-q", "-u", "origin", "main");

      await git(dir, "checkout", "-qb", "feat");
      await commit(dir, "local", "local\n");
      await git(dir, "push", "-q", "-u", "origin", "feat");

      // Diverge: remote moves, local moves differently.
      const clone = mkdtempSync(join(tmpdir(), "gb-clone-"));
      try {
        await exec("git", ["clone", "-q", remote, clone]);
        await git(clone, "checkout", "-q", "feat");
        await commit(clone, "remote", "remote\n");
        await git(clone, "-c", "user.email=t@t", "-c", "user.name=t", "push", "-q", "origin", "feat");
      } finally {
        rmSync(clone, { recursive: true, force: true });
      }
      await commit(dir, "local2", "local2\n");
      await git(dir, "checkout", "-q", "main");

      const before = await git(dir, "rev-parse", "feat");
      const { remoteRef } = await resetBranchToRemote(
        dir,
        {
          name: "feat",
          displayName: "feat",
          kind: "local",
          isCurrent: false,
          isRemote: false,
          upstream: "origin/feat",
        },
      );
      assert.equal(remoteRef, "origin/feat");
      const after = await git(dir, "rev-parse", "feat");
      const originFeat = await git(dir, "rev-parse", "origin/feat");
      assert.notEqual(before.trim(), after.trim());
      assert.equal(after.trim(), originFeat.trim());
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });

  it("pushBranch with setUpstream publishes and sets upstream", async () => {
    const remote = mkdtempSync(join(tmpdir(), "gb-remote-"));
    try {
      await git(remote, "init", "--bare", "-q");
      await git(dir, "remote", "add", "origin", remote);
      await pushBranch(dir, "main", "origin", undefined, true);
      const upstream = (await git(dir, "rev-parse", "--abbrev-ref", "main@{upstream}")).trim();
      assert.equal(upstream, "origin/main");
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });

  it("abortMerge aborts a conflicted merge", async () => {
    await git(dir, "checkout", "-qb", "side");
    await commit(dir, "side", "side\n");
    await git(dir, "checkout", "-q", "main");
    await commit(dir, "main-change", "main\n");
    // Force both to change the same line for a conflict.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "f.txt"), "conflict-main\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "main2");
    await git(dir, "checkout", "-q", "side");
    writeFileSync(join(dir, "f.txt"), "conflict-side\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "side2");
    await git(dir, "checkout", "-q", "main");
    await assert.rejects(git(dir, "merge", "side"));
    await abortMerge(dir);
    assert.match(await git(dir, "status", "--porcelain"), /^\s*$/);
  });

  it("abortRebase aborts a conflicted rebase", async () => {
    await git(dir, "checkout", "-qb", "rbase");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "f.txt"), "rbase-line\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "r1");
    await git(dir, "checkout", "-q", "main");
    writeFileSync(join(dir, "f.txt"), "main-line\n");
    await git(dir, "add", ".");
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "m1");
    await git(dir, "checkout", "-q", "rbase");
    await assert.rejects(git(dir, "rebase", "main"));
    await abortRebase(dir);
    assert.equal((await git(dir, "rev-parse", "--abbrev-ref", "HEAD")).trim(), "rbase");
  });

  it("SimpleGitRepository lists branches with current marker", async () => {
    const repo = new SimpleGitRepository();
    const branches = await repo.getBranches(dir);
    const main = branches.find((b) => b.name === "main");
    assert.ok(main);
    assert.equal(main.isCurrent, true);
    assert.deepEqual(await repo.getRemotes(dir), []);
  });
});
