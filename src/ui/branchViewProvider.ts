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

      return [
        new BranchTreeItem("HEAD", "root"),
        new BranchTreeItem("Local", "root"),
        new BranchTreeItem("Remote", "root"),
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
        .map((branch) => this.toBranchItem(branch));
    }

    if (element.label === "Remote") {
      return branches
        .filter((branch) => branch.isRemote)
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
    const label = branch.isCurrent ? `${branch.displayName} (current)` : branch.displayName;
    return new BranchTreeItem(label, "branch", branch);
  }
}
