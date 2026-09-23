import type { Disposable, ExtensionContext } from "vscode";
import { commands, window, workspace } from "vscode";
import { checkoutBranch } from "../application/branchActions/checkoutBranch";
import { createBranch } from "../application/branchActions/createBranch";
import { createBranchFromBranch } from "../application/branchActions/createBranchFromBranch";
import { copyBranchName } from "../application/branchActions/copyBranchName";
import { checkoutAndRebaseOntoBranch } from "../application/branchActions/checkoutAndRebaseOntoBranch";
import { mergeBranch } from "../application/branchActions/mergeBranch";
import { updateContextKeys, updateRepositoryCount } from "../application/contextKeys";
import { deleteBranch, isNotFullyMergedError } from "../application/branchActions/deleteBranch";
import { describeMerge } from "../application/branchActions/mergeRisk";
import { pullBranch } from "../application/branchActions/pullBranch";
import { rebaseCurrentOntoBranch } from "../application/branchActions/rebaseCurrentOntoBranch";
import { renameBranch } from "../application/branchActions/renameBranch";
import { refreshRemoteBranches } from "../application/branchActions/refreshRemoteBranches";
import { pushBranch } from "../application/branchActions/pushBranch";
import { resetBranchToRemote } from "../application/branchActions/resetBranchToRemote";
import { deleteMergedBranches, listMergedBranches } from "../application/branchActions/deleteMergedBranches";
import { listGoneBranches, pruneGoneBranches } from "../application/branchActions/pruneGoneBranches";
import { copyCommitSha, copyUpstreamName } from "../application/branchActions/copyRefs";
import { abortMerge } from "../application/branchActions/abortMerge";
import { abortRebase } from "../application/branchActions/abortRebase";
import { normalizeGitError } from "../infrastructure/git/gitErrors";
import { isWorkingTreeDirty, stashPop, stashPush } from "../infrastructure/git/workingTree";
import { logOutput } from "../infrastructure/vscode/outputChannel";
import { withProgress } from "../infrastructure/vscode/progress";
import { selectRepository } from "../application/repositorySelection";
import { GraphPanelManager } from "../ui/graphPanel";
import { normalizeFilter } from "../tree/treeFilter";
import { commandIds } from "./commands";
import { discoverRepositories } from "../infrastructure/vscode/repositoryDiscovery";
import { watchGitMetadata } from "../infrastructure/vscode/gitWatcher";
import { subscribeGitExtension } from "../infrastructure/vscode/gitExtension";
import type { RepositoryContext } from "../domain/repository";
import { BranchViewProvider } from "../ui/branchViewProvider";
import type { BranchTreeItem } from "../ui/branchTreeItem";

interface ActionAuth {
  sshPassphrase?: string;
}

async function runAction(
  provider: BranchViewProvider,
  title: string,
  action: (auth?: ActionAuth) => Promise<void>,
  afterSuccess?: (auth?: ActionAuth) => Promise<void> | void,
): Promise<void> {
  let auth: ActionAuth | undefined;
  let retried = false;

  try {
    while (true) {
      try {
        await withProgress(title, () => action(auth));
        provider.refresh();
        try {
          await afterSuccess?.(auth);
        } catch (error) {
          const normalized = normalizeGitError(error);
          logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
        }
        await updateContextKeys(await provider.getSnapshot());
        return;
      } catch (error) {
        const normalized = normalizeGitError(error);

        if (normalized.code === "git_auth_error" && !retried) {
          const passphrase = await window.showInputBox({
            prompt: "Enter SSH passphrase",
            placeHolder: "SSH passphrase",
            password: true,
            ignoreFocusOut: true,
          });

          if (passphrase !== undefined) {
            auth = { sshPassphrase: passphrase };
            retried = true;
            continue;
          }
        }

        logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
        await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
        return;
      }
    }
  } catch (error) {
    const normalized = normalizeGitError(error);
    logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
    await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
  }
}

function getRemoteName(branch: BranchTreeItem["branch"]): string {
  if (!branch) {
    return "origin";
  }

  if (branch.upstream) {
    return branch.upstream.split("/")[0] || "origin";
  }

  if (branch.remoteName) {
    return branch.remoteName;
  }

  return "origin";
}

function getSelectedBranch(item?: BranchTreeItem): BranchTreeItem["branch"] | null {
  return item?.branch ?? null;
}

function getCurrentBranch(snapshot: Awaited<ReturnType<BranchViewProvider["getSnapshot"]>>): BranchTreeItem["branch"] | null {
  return snapshot?.branches.find((candidate) => candidate.isCurrent) ?? null;
}

async function selectPushRemote(
  provider: BranchViewProvider,
  branch: BranchTreeItem["branch"],
): Promise<string> {
  const preferredRemote = getRemoteName(branch);
  const remotes = await provider.getRemotes();

  if (remotes.length <= 1) {
    return remotes[0] ?? preferredRemote;
  }

  const orderedRemotes = [
    preferredRemote,
    ...remotes.filter((remote) => remote !== preferredRemote),
  ].filter((remote, index, list) => list.indexOf(remote) === index);

  const selected = await window.showQuickPick(
    orderedRemotes.map((remote) => ({
      label: remote,
      description: remote === preferredRemote ? "default" : undefined,
    })),
    {
      title: "Select remote",
      placeHolder: "Choose remote to push to",
      ignoreFocusOut: true,
    },
  );

  return selected?.label ?? preferredRemote;
}

async function refreshRemoteRefsBestEffort(
  provider: BranchViewProvider,
  auth?: ActionAuth,
): Promise<void> {
  const repository = provider.getRepository();

  if (!repository) {
    return;
  }

  try {
    await refreshRemoteBranches(repository.rootPath, auth?.sshPassphrase);
  } catch (error) {
    const normalized = normalizeGitError(error);
    logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
  }
}

function formatErrorMessage(message: string, details?: string): string {
  if (!details) {
    return message;
  }

  const firstLine = details
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return message;
  }

  return `${message}: ${firstLine}`;
}

export function registerExtensions(context: ExtensionContext): void {
  const provider = new BranchViewProvider();
  const scmTreeView = window.createTreeView("branchManager.scmView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(scmTreeView);

  const graphPanel = new GraphPanelManager(context);
  context.subscriptions.push(graphPanel);

  const syncViewMessage = (): void => {
    const message = provider.getViewMessage();
    scmTreeView.message = message;
  };

  let gitWatcher: Disposable | null = null;

  const refreshLocalView = async (): Promise<void> => {
    provider.refresh();
    syncViewMessage();
    await updateContextKeys(await provider.getSnapshot());
    if (graphPanel.isOpen()) {
      await graphPanel.refresh();
    }
  };

  /**
   * Runs an operation that requires a clean tree. On dirty state offers
   * "Stash & Continue" instead of failing, and offers to pop afterwards.
   */
  const runActionWithStash = async (
    title: string,
    operation: string,
    rootPath: string,
    needsClean: boolean,
    action: (auth?: ActionAuth) => Promise<void>,
    afterSuccess?: (auth?: ActionAuth) => Promise<void> | void,
  ): Promise<void> => {
    let stashed = false;

    if (needsClean) {
      let dirty = false;
      try {
        dirty = await isWorkingTreeDirty(rootPath);
      } catch {
        dirty = false;
      }

      if (dirty) {
        const choice = await window.showWarningMessage(
          `Uncommitted changes block ${operation}. Stash them and continue?`,
          { modal: true },
          "Stash & Continue",
        );

        if (choice !== "Stash & Continue") {
          return;
        }

        try {
          await withProgress("Stash changes", () => stashPush(rootPath));
          stashed = true;
        } catch (error) {
          const normalized = normalizeGitError(error);
          logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
          await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
          return;
        }
      }
    }

    await runAction(provider, title, action, afterSuccess);

    if (stashed) {
      // Stash pop is safe to run unprompted: on conflict git keeps the
      // stash entry, and the error tells the user to resolve manually.
      try {
        await withProgress("Restore stashed changes", () => stashPop(rootPath));
      } catch (error) {
        const normalized = normalizeGitError(error);
        logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
        await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
      } finally {
        await refreshLocalView();
      }
    }
  };

  const attachRepository = async (repository: RepositoryContext | null): Promise<void> => {
    gitWatcher?.dispose();
    gitWatcher = null;
    provider.setRepository(repository);
    graphPanel.setRepository(repository);
    if (repository) {
      gitWatcher = watchGitMetadata(repository.rootPath, () => {
        void refreshLocalView();
      });
      context.subscriptions.push(gitWatcher);
    }
    await refreshLocalView();
  };

  const gitExtensionSubscription = subscribeGitExtension(() => {
    void refreshLocalView();
  });
  if (gitExtensionSubscription) {
    context.subscriptions.push(gitExtensionSubscription);
  }

  context.subscriptions.push({
    dispose(): void {
      gitWatcher?.dispose();
      gitWatcher = null;
    },
  });

  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(async () => {
      const repositories = await discoverRepositories();
      await updateRepositoryCount(repositories.length);
      const current = provider.getRepository();
      if (current && repositories.some((candidate) => candidate.rootPath === current.rootPath)) {
        await refreshLocalView();
        return;
      }
      await attachRepository(await selectRepository(repositories));
    }),
  );

  void (async () => {
    const repositories = await discoverRepositories();
    await updateRepositoryCount(repositories.length);
    await attachRepository(await selectRepository(repositories));
  })();

  context.subscriptions.push(
    commands.registerCommand(commandIds.filterBranches, async () => {
      const input = await window.showInputBox({
        title: "Filter branches",
        prompt: "Show only branches matching text (empty clears the filter)",
        value: provider.getFilter() ?? "",
        ignoreFocusOut: true,
      });

      if (input === undefined) {
        return;
      }

      provider.setFilter(normalizeFilter(input));
      provider.refresh();
      syncViewMessage();
      await updateContextKeys(await provider.getSnapshot());
    }),
    commands.registerCommand(commandIds.toggleBranchGrouping, async () => {
      provider.setGroupByPrefix(!provider.isGroupByPrefix());
      provider.refresh();
      syncViewMessage();
      await updateContextKeys(await provider.getSnapshot());
    }),
    commands.registerCommand(commandIds.openGraph, async () => {
      graphPanel.open(provider.getRepository());
    }),
    commands.registerCommand(commandIds.switchRepository, async () => {
      const repositories = await discoverRepositories();
      await updateRepositoryCount(repositories.length);
      if (repositories.length === 0) {
        await window.showInformationMessage("No Git repositories found in the current workspace.");
        return;
      }
      const selected = await selectRepository(repositories);
      if (selected) {
        await attachRepository(selected);
      }
    }),
    commands.registerCommand(commandIds.refresh, async () => {
      await refreshRemoteRefsBestEffort(provider);
      provider.refresh();
      syncViewMessage();
      await updateContextKeys(await provider.getSnapshot());
    }),
    commands.registerCommand(commandIds.fetchRemotes, async () => {
      await runAction(provider, "Fetch All Remotes", async (auth) => {
        const repository = provider.getRepository();
        if (!repository) {
          return;
        }

        await refreshRemoteBranches(repository.rootPath, auth?.sshPassphrase);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.checkout, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = item?.branch;

      if (!repository || !branch) {
        return;
      }

      await runActionWithStash(`Checkout ${branch.name}`, "checkout", repository.rootPath, true, async () => {
        await checkoutBranch(repository.rootPath, branch);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.createBranchFromSelected, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const sourceBranch = getSelectedBranch(item);

      if (!repository || !sourceBranch) {
        return;
      }

      const branchName = await window.showInputBox({
        title: "New branch from selected",
        prompt: `Enter new branch name based on "${sourceBranch.name}"`,
        ignoreFocusOut: true,
      });

      if (!branchName) {
        return;
      }

      await runAction(provider, `New branch ${branchName} from ${sourceBranch.name}`, async () => {
        await createBranchFromBranch(repository.rootPath, sourceBranch, branchName);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.copyBranchName, async (item?: BranchTreeItem) => {
      const branch = item?.branch;

      if (!branch) {
        return;
      }

      await copyBranchName(branch.name);
    }),
    commands.registerCommand(commandIds.createBranch, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      const branchName = await window.showInputBox({
        title: "Create branch",
        prompt: "Enter new branch name",
        ignoreFocusOut: true,
      });

      if (!branchName) {
        return;
      }

      await runAction(provider, `Create branch ${branchName}`, async () => {
        await createBranch(repository.rootPath, branchName);
      }, syncViewMessage);
      void item;
    }),
    commands.registerCommand(commandIds.renameBranch, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = getSelectedBranch(item);

      if (!repository || !branch || branch.isCurrent || branch.isRemote) {
        return;
      }

      const newBranchName = await window.showInputBox({
        title: "Rename branch",
        prompt: `Enter new name for "${branch.name}"`,
        value: branch.name,
        ignoreFocusOut: true,
      });

      if (!newBranchName || newBranchName === branch.name) {
        return;
      }

      await runAction(provider, `Rename ${branch.name} to ${newBranchName}`, async () => {
        await renameBranch(repository.rootPath, branch.name, newBranchName);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.deleteBranch, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branchName = item?.branch?.name;

      if (!repository || !branchName || item?.branch?.isCurrent || item?.branch?.isRemote) {
        return;
      }

      const confirmed = await window.showWarningMessage(
        `Delete branch "${branchName}"?`,
        { modal: true },
        "Delete",
      );

      if (confirmed !== "Delete") {
        return;
      }

      try {
        await withProgress(`Delete branch ${branchName}`, async () => {
          await deleteBranch(repository.rootPath, branchName);
        });
        provider.refresh();
        syncViewMessage();
        await updateContextKeys(await provider.getSnapshot());
        return;
      } catch (error) {
        if (!isNotFullyMergedError(error)) {
          const normalized = normalizeGitError(error);
          logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
          await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
          return;
        }
      }

      const forceConfirmed = await window.showWarningMessage(
        `Branch "${branchName}" is not fully merged. Force delete? Commits will be lost.`,
        { modal: true },
        "Force Delete",
      );

      if (forceConfirmed !== "Force Delete") {
        return;
      }

      await runAction(provider, `Force delete branch ${branchName}`, async () => {
        await deleteBranch(repository.rootPath, branchName, true);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.pull, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      await runAction(provider, "Pull", async (auth) => {
        const snapshot = await provider.getSnapshot();
        const branch =
          item?.branch ?? snapshot?.branches.find((candidate) => candidate.isCurrent) ?? null;

        if (!branch || branch.isRemote) {
          return;
        }

        await pullBranch(
          repository.rootPath,
          branch.name,
          getRemoteName(branch),
          branch.isCurrent,
          auth?.sshPassphrase,
        );
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.push, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      const snapshot = await provider.getSnapshot();
      const branch =
        item?.branch ?? snapshot?.branches.find((candidate) => candidate.isCurrent) ?? null;

      if (!branch || branch.isRemote) {
        return;
      }

      const remoteName = await selectPushRemote(provider, branch);
      const needsUpstream = !branch.upstream;

      await runAction(provider, needsUpstream ? `Publish ${branch.name} to ${remoteName}` : "Push", async (auth) => {
        await pushBranch(repository.rootPath, branch.name, remoteName, auth?.sshPassphrase, needsUpstream);
      }, async (auth) => {
        await refreshRemoteRefsBestEffort(provider, auth);
        provider.refresh();
        syncViewMessage();
      });
    }),
    commands.registerCommand(commandIds.mergeIntoCurrent, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = item?.branch;
      const snapshot = await provider.getSnapshot();

      if (!repository || !branch || branch.isCurrent || snapshot?.state !== "normal") {
        return;
      }

      const currentBranch = snapshot?.currentBranch ?? "current branch";
      const hint = await describeMerge(repository.rootPath, branch.name, currentBranch).catch(() => null);
      const confirmed = await window.showWarningMessage(
        `Merge "${branch.name}" into "${currentBranch}"?${hint ? ` (${hint})` : ""}`,
        { modal: true },
        "Merge",
      );

      if (confirmed !== "Merge") {
        return;
      }

      await runActionWithStash(
        `Merge ${branch.name}`,
        "merge",
        repository.rootPath,
        true,
        async () => {
          await mergeBranch(repository.rootPath, branch);
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.checkoutAndRebaseOntoSelected, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const targetBranch = getSelectedBranch(item);
      const snapshot = await provider.getSnapshot();
      const sourceBranch = getCurrentBranch(snapshot);

      if (!repository || !targetBranch || !sourceBranch || sourceBranch.isRemote || snapshot?.state !== "normal") {
        return;
      }

      if (sourceBranch.name === targetBranch.name) {
        return;
      }

      const confirmed = await window.showWarningMessage(
        `Checkout "${targetBranch.name}" and rebase "${sourceBranch.name}" onto it?`,
        { modal: true },
        "Checkout and Rebase",
      );

      if (confirmed !== "Checkout and Rebase") {
        return;
      }

      await runActionWithStash(
        `Checkout and Rebase ${sourceBranch.name} onto ${targetBranch.name}`,
        "checkout and rebase",
        repository.rootPath,
        true,
        async () => {
          await checkoutAndRebaseOntoBranch(repository.rootPath, sourceBranch.name, targetBranch);
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.rebaseCurrentOntoSelected, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = item?.branch;
      const snapshot = await provider.getSnapshot();

      if (!repository || !branch || branch.isCurrent || snapshot?.state !== "normal") {
        return;
      }

      const currentBranch = snapshot?.currentBranch ?? "current branch";
      const confirmed = await window.showWarningMessage(
        `Rebase "${currentBranch}" onto "${branch.name}"?`,
        { modal: true },
        "Rebase",
      );

      if (confirmed !== "Rebase") {
        return;
      }

      await runActionWithStash(
        `Rebase onto ${branch.name}`,
        "rebase",
        repository.rootPath,
        true,
        async () => {
          await rebaseCurrentOntoBranch(repository.rootPath, branch);
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.resetToRemote, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = getSelectedBranch(item);
      const snapshot = await provider.getSnapshot();

      if (!repository || !branch || branch.isRemote || snapshot?.state !== "normal") {
        return;
      }

      const remoteRef = branch.upstream ?? `origin/${branch.name}`;
      const divergence =
        branch.ahead || branch.behind
          ? ` (local +${branch.ahead ?? 0}/-${branch.behind ?? 0})`
          : "";
      const confirmed = await window.showWarningMessage(
        `Reset "${branch.name}"${divergence} to "${remoteRef}"? Local commits will be lost.`,
        { modal: true },
        "Reset",
      );

      if (confirmed !== "Reset") {
        return;
      }

      await runActionWithStash(
        `Reset ${branch.name} to ${remoteRef}`,
        "reset",
        repository.rootPath,
        branch.isCurrent,
        async (auth) => {
          await resetBranchToRemote(repository.rootPath, branch, auth?.sshPassphrase);
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.abortMerge, async () => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      await runAction(provider, "Abort merge", async () => {
        await abortMerge(repository.rootPath);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.abortRebase, async () => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      await runAction(provider, "Abort rebase", async () => {
        await abortRebase(repository.rootPath);
      }, syncViewMessage);
    }),
    commands.registerCommand(commandIds.deleteMergedBranches, async () => {
      const repository = provider.getRepository();
      const snapshot = await provider.getSnapshot();
      const current = snapshot?.currentBranch;

      if (!repository || !current || snapshot?.state !== "normal") {
        return;
      }

      const candidates = await listMergedBranches(repository.rootPath, current);
      if (candidates.length === 0) {
        await window.showInformationMessage("No merged branches to delete.");
        return;
      }

      const confirmed = await window.showWarningMessage(
        `Delete ${candidates.length} merged branch(es)? ${candidates.join(", ")}`,
        { modal: true },
        "Delete",
      );

      if (confirmed !== "Delete") {
        return;
      }

      await runAction(
        provider,
        "Delete merged branches",
        async () => {
          const result = await deleteMergedBranches(repository.rootPath, current);
          if (result.deleted.length > 0 || result.skipped.length > 0) {
            void window.showInformationMessage(
              `Deleted: ${result.deleted.join(", ") || "none"}. Skipped: ${result.skipped.join(", ") || "none"}.`,
            );
          }
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.pruneGoneBranches, async () => {
      const repository = provider.getRepository();
      if (!repository) {
        return;
      }

      const candidates = await listGoneBranches(repository.rootPath);
      if (candidates.length === 0) {
        await window.showInformationMessage("No branches with gone upstream.");
        return;
      }

      const confirmed = await window.showWarningMessage(
        `Delete ${candidates.length} branch(es) with gone upstream? ${candidates.join(", ")}`,
        { modal: true },
        "Delete",
      );

      if (confirmed !== "Delete") {
        return;
      }

      await runAction(
        provider,
        "Prune gone branches",
        async () => {
          const result = await pruneGoneBranches(repository.rootPath);
          if (result.deleted.length > 0 || result.skipped.length > 0) {
            void window.showInformationMessage(
              `Deleted: ${result.deleted.join(", ") || "none"}. Skipped: ${result.skipped.join(", ") || "none"}.`,
            );
          }
        },
        syncViewMessage,
      );
    }),
    commands.registerCommand(commandIds.copyCommitSha, async (item?: BranchTreeItem) => {
      const repository = provider.getRepository();
      const branch = item?.branch;

      if (!repository || !branch) {
        return;
      }

      await runAction(provider, "Copy commit SHA", async () => {
        await copyCommitSha(repository.rootPath, branch.name);
      });
    }),
    commands.registerCommand(commandIds.copyUpstreamName, async (item?: BranchTreeItem) => {      const branch = item?.branch;

      if (!branch || !branch.upstream) {
        await window.showInformationMessage("This branch has no upstream.");
        return;
      }

      await copyUpstreamName(branch.upstream);
    }),
  );
}
