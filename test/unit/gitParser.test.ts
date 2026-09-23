import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRecord, repositoryDisplayName, toBranchRef } from "../../src/infrastructure/git/gitParser";

describe("parseRecord", () => {
  it("parses a full NUL-separated line", () => {
    const line = ["main", "refs/heads/main", "*", "origin/main", "abc123", "2026-01-01 10:00:00 +0000", "hello"].join("\0");
    const record = parseRecord(line);
    assert.deepEqual(record, {
      name: "main",
      refname: "refs/heads/main",
      head: "*",
      upstream: "origin/main",
      objectName: "abc123",
      committerDate: "2026-01-01 10:00:00 +0000",
      subject: "hello",
    });
  });

  it("returns null for short lines", () => {
    assert.equal(parseRecord("a\0b\0c"), null);
    assert.equal(parseRecord(""), null);
  });
});

describe("toBranchRef", () => {
  it("maps a local current branch", () => {
    const branch = toBranchRef({
      name: "main",
      refname: "refs/heads/main",
      head: "*",
      upstream: "origin/main",
      objectName: "abc",
      committerDate: "2026-01-01 10:00:00 +0000",
      subject: "msg",
    });
    assert.equal(branch.kind, "local");
    assert.equal(branch.isCurrent, true);
    assert.equal(branch.isRemote, false);
    assert.equal(branch.upstream, "origin/main");
    assert.equal(branch.lastCommitMessage, "msg");
    assert.ok(branch.lastCommitDate instanceof Date);
  });

  it("maps a remote branch with remoteName", () => {
    const branch = toBranchRef({
      name: "origin/feat",
      refname: "refs/remotes/origin/feat",
      head: "",
      upstream: "",
      objectName: "abc",
      committerDate: "",
      subject: "",
    });
    assert.equal(branch.kind, "remote");
    assert.equal(branch.isRemote, true);
    assert.equal(branch.remoteName, "origin");
    assert.equal(branch.upstream, undefined);
  });

  it("treats empty upstream/subject as undefined", () => {
    const branch = toBranchRef({
      name: "x",
      refname: "refs/heads/x",
      head: "",
      upstream: "",
      objectName: "abc",
      committerDate: "",
      subject: "",
    });
    assert.equal(branch.upstream, undefined);
    assert.equal(branch.lastCommitMessage, undefined);
  });
});

describe("repositoryDisplayName", () => {
  it("takes the last path segment", () => {
    assert.equal(repositoryDisplayName("/a/b/my-repo"), "my-repo");
    assert.equal(repositoryDisplayName("C:\\a\\b\\repo"), "repo");
  });
});
