import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeGitError } from "../../src/infrastructure/git/gitErrors";
import { isNotFullyMergedError } from "../../src/application/branchActions/deleteBranch";
import { BranchManagerError } from "../../src/domain/errors";
import { resolveRemoteRef } from "../../src/application/branchActions/resetBranchToRemote";
import type { BranchRef } from "../../src/domain/branch";

describe("normalizeGitError", () => {
  it("maps auth failures", () => {
    const err = normalizeGitError(new BranchManagerError("cmd failed", "git_error", "Permission denied (publickey)"));
    assert.equal(err.code, "git_auth_error");
  });

  it("maps missing upstream", () => {
    const err = normalizeGitError(new BranchManagerError("cmd failed", "git_error", "no upstream configured"));
    assert.equal(err.code, "git_no_upstream");
    assert.match(err.message, /upstream/i);
  });

  it("maps not fully merged", () => {
    const err = normalizeGitError(new BranchManagerError("cmd failed", "git_error", "branch 'f' is not fully merged"));
    assert.equal(err.code, "git_not_fully_merged");
  });

  it("maps nothing to abort", () => {
    const err = normalizeGitError(new BranchManagerError("cmd failed", "git_error", "no merge in progress"));
    assert.equal(err.code, "git_nothing_to_abort");
  });

  it("passes through unknown errors as git_error", () => {
    const err = normalizeGitError(new Error("boom"));
    assert.equal(err.code, "git_error");
  });
});

describe("isNotFullyMergedError", () => {
  it("detects the git message", () => {
    const err = new BranchManagerError("x", "git_error", "error: branch 'f' is not fully merged");
    assert.equal(isNotFullyMergedError(err), true);
    assert.equal(isNotFullyMergedError(new Error("other")), false);
  });
});

describe("resolveRemoteRef", () => {
  const base: BranchRef = {
    name: "feat",
    displayName: "feat",
    kind: "local",
    isCurrent: false,
    isRemote: false,
  };

  it("prefers upstream when set", () => {
    assert.deepEqual(resolveRemoteRef({ ...base, upstream: "upstream/feat" }), {
      remoteName: "upstream",
      remoteRef: "upstream/feat",
    });
  });

  it("falls back to origin/<name>", () => {
    assert.deepEqual(resolveRemoteRef(base), { remoteName: "origin", remoteRef: "origin/feat" });
  });
});
