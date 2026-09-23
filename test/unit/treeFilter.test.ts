import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesBranchFilter, normalizeFilter } from "../../src/tree/treeFilter";
import type { BranchRef } from "../../src/domain/branch";

function branch(overrides: Partial<BranchRef> & { name: string }): BranchRef {
  return {
    displayName: overrides.name,
    kind: "local",
    isCurrent: false,
    isRemote: false,
    ...overrides,
  };
}

describe("normalizeFilter", () => {
  it("trims and lowercases, empty becomes null", () => {
    assert.equal(normalizeFilter("  Feat "), "feat");
    assert.equal(normalizeFilter(""), null);
    assert.equal(normalizeFilter("   "), null);
    assert.equal(normalizeFilter(undefined), null);
  });
});

describe("matchesBranchFilter", () => {
  it("matches case-insensitively by display name", () => {
    assert.equal(matchesBranchFilter(branch({ name: "feature/login" }), "LOGIN"), true);
    assert.equal(matchesBranchFilter(branch({ name: "feature/login" }), "xyz"), false);
  });

  it("matches remote branches by short name", () => {
    assert.equal(
      matchesBranchFilter(branch({ name: "origin/feat/x", isRemote: true, remoteName: "origin" }), "feat"),
      true,
    );
    assert.equal(
      matchesBranchFilter(branch({ name: "origin/feat/x", isRemote: true, remoteName: "origin" }), "origin"),
      false,
    );
  });

  it("always keeps the current branch visible", () => {
    assert.equal(matchesBranchFilter(branch({ name: "main", isCurrent: true }), "zzz"), true);
  });

  it("passes everything without a filter", () => {
    assert.equal(matchesBranchFilter(branch({ name: "a" }), null), true);
  });
});
