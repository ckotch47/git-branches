import type { Event, TreeDataProvider, TreeItem } from "vscode";
import { EventEmitter } from "vscode";
import type { BranchRef } from "../domain/branch";
import type { RepositoryContext } from "../domain/repository";
import { SimpleGitRepository } from "../infrastructure/git/simpleGitRepository";
import { buildSnapshot } from "../tree/snapshotBuilder";
import { BranchTreeItem } from "./branchTreeItem";
import type { BranchViewState } from "./branchViewState";
import type { TreeSnapshot } from "../tree/treeModel";

export class BranchViewProvider implements TreeDataProvider<BranchTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new EventEmitter<
    void | BranchTreeItem | BranchTreeItem[] | null | undefined
  >();

  private readonly gitRepository = new SimpleGitRepository();
  private snapshot: TreeSnapshot | null = null;
  private readonly state: BranchViewState = {
    repository: null,
  };

  readonly onDidChangeTreeData: Event<
    void | BranchTreeItem | BranchTreeItem[] | null | undefined
  > = this.onDidChangeTreeDataEmitter.event;

  setRepository(repository: RepositoryContext | null): void {
    this.state.repository = repository;
    this.state.repositoryId = repository?.rootPath;
    this.snapshot = null;
  }

  getRepository(): RepositoryContext | null {
    return this.state.repository;
  }

  getViewMessage(): string | undefined {
    if (!this.state.repository) {
      return "Open a folder with a Git repository";
    }

    if (!this.snapshot) {
      return undefined;
    }

    if (this.snapshot.state === "empty") {
      return "No Git repository found in the current workspace";
    }

    if (this.snapshot.state === "detached") {
      return "Detached HEAD";
    }

    return undefined;
  }

  async getSnapshot(): Promise<TreeSnapshot | null> {
    if (!this.state.repository) {
      return null;
    }

    return this.ensureSnapshot();
  }

  async getRemotes(): Promise<string[]> {
    if (!this.state.repository) {
      return [];
    }

    try {
      return await this.gitRepository.getRemotes(this.state.repository.rootPath);
    } catch {
      return [];
    }
  }

  async getChildren(element?: BranchTreeItem): Promise<BranchTreeItem[]> {
    if (!this.state.repository) {
      return [];
    }

    const snapshot = await this.ensureSnapshot();
    const branches = snapshot.branches;

    if (!element) {
      if (snapshot.state === "empty") {
        return [];
      }

      const remoteNames = collectRemoteNames(branches);

      return [
        new BranchTreeItem("HEAD", "root"),
        new BranchTreeItem("Local", "root"),
        ...remoteNames.map((remoteName) => new BranchTreeItem(remoteName, "remoteGroup", undefined, remoteName)),
      ];
    }

    if (element.label === "HEAD") {
      if (snapshot.state === "detached") {
        return [];
      }

      const current = branches.find((branch) => branch.isCurrent);
      return current ? [this.toBranchItem(current)] : [];
    }

    if (element.label === "Local") {
      return branches
        .filter((branch) => !branch.isRemote)
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
        .map((branch) => this.toBranchItem(branch));
    }

    if (element.itemType === "remoteGroup" && element.remoteName) {
      return branches
        .filter((branch) => branch.isRemote && branch.remoteName === element.remoteName)
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
        .map((branch) => this.toBranchItem(branch));
    }

    return [];
  }

  getTreeItem(element: BranchTreeItem): TreeItem {
    return element;
  }

  refresh(): void {
    this.snapshot = null;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  private async ensureSnapshot(): Promise<TreeSnapshot> {
    if (!this.snapshot) {
      this.snapshot = await buildSnapshot(this.gitRepository, this.state.repository!);
    }

    return this.snapshot;
  }

  private toBranchItem(branch: BranchRef): BranchTreeItem {
    const label = branch.isRemote ? shortRemoteBranchName(branch.name) : branch.displayName;
    const item = new BranchTreeItem(label, "branch", branch);

    const descriptionParts: string[] = [];

    if (branch.isCurrent) {
      descriptionParts.push("current");
    }

    const aheadBehind = formatAheadBehind(branch);
    if (aheadBehind) {
      descriptionParts.push(aheadBehind);
    }

    if (branch.isRemote && branch.remoteName) {
      descriptionParts.push(branch.remoteName);
    }

    item.description = descriptionParts.join(" · ") || undefined;
    item.tooltip = buildBranchTooltip(branch, label);

    return item;
  }
}

function collectRemoteNames(branches: BranchRef[]): string[] {
  return branches
    .filter((branch) => branch.isRemote)
    .map((branch) => branch.remoteName ?? branch.name.split("/")[0] ?? "origin")
    .filter((remoteName, index, list) => list.indexOf(remoteName) === index)
    .sort((left, right) => left.localeCompare(right));
}

function shortRemoteBranchName(name: string): string {
  return name.split("/").slice(1).join("/") || name;
}

function formatAheadBehind(branch: BranchRef): string {
  const parts: string[] = [];

  if (typeof branch.ahead === "number" && branch.ahead > 0) {
    parts.push(`↑${branch.ahead}`);
  }

  if (typeof branch.behind === "number" && branch.behind > 0) {
    parts.push(`↓${branch.behind}`);
  }

  return parts.join(" ");
}

function buildBranchTooltip(branch: BranchRef, label: string): string {
  const lines: string[] = [`${label}`, `Full name: ${branch.name}`];

  if (branch.upstream) {
    lines.push(`Upstream: ${branch.upstream}`);
  }

  const aheadBehind = formatAheadBehind(branch);
  if (aheadBehind) {
    lines.push(`Status: ${aheadBehind}`);
  }

  if (branch.lastCommitMessage) {
    lines.push(`Last commit: ${branch.lastCommitMessage}`);
  }

  if (branch.lastCommitDate) {
    lines.push(`Updated: ${branch.lastCommitDate.toISOString()}`);
  }

  return lines.join("\n");
}
