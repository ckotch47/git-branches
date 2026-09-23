import type { Event, TreeDataProvider, TreeItem } from "vscode";
import { EventEmitter } from "vscode";
import type { BranchRef } from "../domain/branch";
import type { RepositoryContext } from "../domain/repository";
import { SimpleGitRepository } from "../infrastructure/git/simpleGitRepository";
import { buildSnapshot } from "../tree/snapshotBuilder";
import { buildBranchTooltip, collectRemoteNames, formatAheadBehind, shortRemoteBranchName, sortBranchesForView } from "../tree/branchFormat";
import { matchesBranchFilter } from "../tree/treeFilter";
import { groupLocalBranches, prefixOf } from "../tree/branchGrouping";
import { BranchTreeItem } from "./branchTreeItem";
import type { BranchViewState } from "./branchViewState";
import type { TreeSnapshot } from "../tree/treeModel";

/** Transient burst-window cache (ms). Cleared on refresh(); never survives restart. */
const SNAPSHOT_TTL_MS = 1500;

export class BranchViewProvider implements TreeDataProvider<BranchTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new EventEmitter<
    void | BranchTreeItem | BranchTreeItem[] | null | undefined
  >();

  private readonly gitRepository = new SimpleGitRepository();
  private snapshot: TreeSnapshot | null = null;
  private snapshotPromise: Promise<TreeSnapshot> | null = null;
  private snapshotFetchedAt = 0;
  private readonly state: BranchViewState = {
    repository: null,
  };
  private filter: string | null = null;
  /** In-memory only, default off, never persisted (ADR: no persistent state). */
  private groupByPrefix = false;

  readonly onDidChangeTreeData: Event<
    void | BranchTreeItem | BranchTreeItem[] | null | undefined
  > = this.onDidChangeTreeDataEmitter.event;

  setRepository(repository: RepositoryContext | null): void {
    this.state.repository = repository;
    this.state.repositoryId = repository?.rootPath;
    this.snapshot = null;
    this.snapshotPromise = null;
    this.snapshotFetchedAt = 0;
    this.filter = null;
  }

  setFilter(filter: string | null): void {
    this.filter = filter;
  }

  getFilter(): string | null {
    return this.filter;
  }

  setGroupByPrefix(enabled: boolean): void {
    this.groupByPrefix = enabled;
  }

  isGroupByPrefix(): boolean {
    return this.groupByPrefix;
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

    const flags: string[] = [];
    if (this.filter) {
      flags.push(`Filter: "${this.filter}"`);
    }
    if (this.groupByPrefix) {
      flags.push("Grouped by prefix");
    }

    return flags.join(" · ") || undefined;
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

      const visible = branches.filter((branch) => matchesBranchFilter(branch, this.filter));
      if (this.filter && visible.length === 0) {
        return [new BranchTreeItem(`No branches match "${this.filter}"`, "message")];
      }

      const remoteNames = collectRemoteNames(visible);
      const hasLocal = visible.some((branch) => !branch.isRemote);

      return [
        ...(hasLocal ? [new BranchTreeItem("Local", "root")] : []),
        ...remoteNames.map((remoteName) => new BranchTreeItem(remoteName, "remoteGroup", undefined, remoteName)),
      ];
    }

    if (element.label === "Local") {
      const locals = branches.filter((branch) => !branch.isRemote && matchesBranchFilter(branch, this.filter));

      if (this.groupByPrefix) {
        const groups = groupLocalBranches(locals);
        const groupedNames = new Set(groups.flatMap((group) => group.branches.map((branch) => branch.name)));
        const ungrouped = locals.filter((branch) => !groupedNames.has(branch.name));
        return [
          ...groups.map(
            (group) => new BranchTreeItem(`${group.prefix}/`, "group", undefined, undefined, group.prefix),
          ),
          ...sortBranchesForView(ungrouped).map((branch) => this.toBranchItem(branch)),
        ];
      }

      return sortBranchesForView(locals).map((branch) => this.toBranchItem(branch));
    }

    if (element.itemType === "group" && element.prefix) {
      const prefix = element.prefix;
      return sortBranchesForView(
        branches.filter(
          (branch) =>
            !branch.isRemote &&
            prefixOf(branch.displayName) === prefix &&
            matchesBranchFilter(branch, this.filter),
        ),
      ).map((branch) => this.toBranchItem(branch));
    }

    if (element.itemType === "remoteGroup" && element.remoteName) {
      return sortBranchesForView(
        branches.filter(
          (branch) =>
            branch.isRemote &&
            branch.remoteName === element.remoteName &&
            matchesBranchFilter(branch, this.filter),
        ),
      ).map((branch) => this.toBranchItem(branch));
    }

    return [];
  }

  getTreeItem(element: BranchTreeItem): TreeItem {
    return element;
  }

  refresh(): void {
    this.snapshot = null;
    this.snapshotPromise = null;
    this.snapshotFetchedAt = 0;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  private async ensureSnapshot(): Promise<TreeSnapshot> {
    if (this.snapshot && Date.now() - this.snapshotFetchedAt < SNAPSHOT_TTL_MS) {
      return this.snapshot;
    }

    if (!this.snapshotPromise) {
      const repository = this.state.repository!;
      this.snapshotPromise = buildSnapshot(this.gitRepository, repository)
        .then((snapshot) => {
          this.snapshot = snapshot;
          this.snapshotFetchedAt = Date.now();
          return snapshot;
        })
        .finally(() => {
          this.snapshotPromise = null;
        });
    }

    return this.snapshotPromise;
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

    if (branch.lastCommitMessage) {
      descriptionParts.push(branch.lastCommitMessage);
    }

    item.description = descriptionParts.join(" · ") || undefined;
    item.tooltip = buildBranchTooltip(branch, label);

    return item;
  }
}
