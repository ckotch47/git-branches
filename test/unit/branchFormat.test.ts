import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBranchTooltip,
  collectRemoteNames,
  formatAheadBehind,
  shortRemoteBranchName,
  sortBranchesForView,
} from "../../src/tree/branchFormat";
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

describe("formatAheadBehind", () => {
  it("formats ahead/behind counters", () => {
    assert.equal(formatAheadBehind(branch({ name: "a", ahead: 2, behind: 3 })), "↑2 ↓3");
    assert.equal(formatAheadBehind(branch({ name: "a", ahead: 1 })), "↑1");
    assert.equal(formatAheadBehind(branch({ name: "a" })), "");
  });
});

describe("collectRemoteNames", () => {
  it("dedupes and sorts remote names", () => {
    const names = collectRemoteNames([
      branch({ name: "origin/a", isRemote: true, remoteName: "origin" }),
      branch({ name: "upstream/b", isRemote: true, remoteName: "upstream" }),
      branch({ name: "origin/c", isRemote: true, remoteName: "origin" }),
      branch({ name: "local" }),
    ]);
    assert.deepEqual(names, ["origin", "upstream"]);
  });
});

describe("shortRemoteBranchName", () => {
  it("strips the remote prefix", () => {
    assert.equal(shortRemoteBranchName("origin/feat/x"), "feat/x");
    assert.equal(shortRemoteBranchName("origin"), "origin");
  });
});

describe("buildBranchTooltip", () => {
  it("includes upstream, status and last commit", () => {
    const tip = buildBranchTooltip(
      branch({ name: "f", upstream: "origin/f", ahead: 1, lastCommitMessage: "wip" }),
      "f",
    );
    assert.match(tip, /Upstream: origin\/f/);
    assert.match(tip, /↑1/);
    assert.match(tip, /Last commit: wip/);
  });
});

describe("sortBranchesForView", () => {
  it("puts current first, then by recency, then alphabetically", () => {
    const sorted = sortBranchesForView([
      branch({ name: "b", lastCommitDate: new Date("2026-01-02") }),
      branch({ name: "a", lastCommitDate: new Date("2026-01-03") }),
      branch({ name: "cur", isCurrent: true, lastCommitDate: new Date("2020-01-01") }),
    ]).map((b) => b.name);
    assert.deepEqual(sorted, ["cur", "a", "b"]);
  });
});
