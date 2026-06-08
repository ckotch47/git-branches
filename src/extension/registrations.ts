import type { ExtensionContext } from "vscode";
import { commands, window } from "vscode";
import { checkoutBranch } from "../application/branchActions/checkoutBranch";
import { createBranch } from "../application/branchActions/createBranch";
import { createBranchFromBranch } from "../application/branchActions/createBranchFromBranch";
import { copyBranchName } from "../application/branchActions/copyBranchName";
import { checkoutAndRebaseOntoBranch } from "../application/branchActions/checkoutAndRebaseOntoBranch";
import { mergeBranch } from "../application/branchActions/mergeBranch";
import { updateContextKeys } from "../application/contextKeys";
import { deleteBranch } from "../application/branchActions/deleteBranch";
import { pullBranch } from "../application/branchActions/pullBranch";
import { rebaseCurrentOntoBranch } from "../application/branchActions/rebaseCurrentOntoBranch";
import { renameBranch } from "../application/branchActions/renameBranch";
import { refreshRemoteBranches } from "../application/branchActions/refreshRemoteBranches";
import { pushBranch } from "../application/branchActions/pushBranch";
import { normalizeGitError } from "../infrastructure/git/gitErrors";
import { logOutput } from "../infrastructure/vscode/outputChannel";
import { withProgress } from "../infrastructure/vscode/progress";
import { selectRepository } from "../application/repositorySelection";
import { commandIds } from "./commands";
import { discoverRepositories } from "../infrastructure/vscode/repositoryDiscovery";
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

  const syncViewMessage = (): void => {
    const message = provider.getViewMessage();
    scmTreeView.message = message;
  };

  void (async () => {
    const repositories = await discoverRepositories();
    const selectedRepository = await selectRepository(repositories);
    provider.setRepository(selectedRepository);
    provider.refresh();
    syncViewMessage();
    await updateContextKeys(await provider.getSnapshot());
  })();

  context.subscriptions.push(
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

      await runAction(provider, `Checkout ${branch.name}`, async () => {
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

      await runAction(provider, `Delete branch ${branchName}`, async () => {
        await deleteBranch(repository.rootPath, branchName);
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

      await runAction(provider, "Push", async (auth) => {
        await pushBranch(repository.rootPath, branch.name, remoteName, auth?.sshPassphrase);
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
      const confirmed = await window.showWarningMessage(
        `Merge "${branch.name}" into "${currentBranch}"?`,
        { modal: true },
        "Merge",
      );

      if (confirmed !== "Merge") {
        return;
      }

      await runAction(provider, `Merge ${branch.name}`, async () => {
        await mergeBranch(repository.rootPath, branch);
      }, syncViewMessage);
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

      try {
        await withProgress(`Checkout and Rebase ${sourceBranch.name} onto ${targetBranch.name}`, async () => {
          await checkoutAndRebaseOntoBranch(repository.rootPath, sourceBranch.name, targetBranch);
        });
      } catch (error) {
        const normalized = normalizeGitError(error);
        logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
        await window.showErrorMessage(formatErrorMessage(normalized.message, normalized.details));
      } finally {
        provider.refresh();
        syncViewMessage();
        await updateContextKeys(await provider.getSnapshot());
      }
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

      await runAction(provider, `Rebase onto ${branch.name}`, async () => {
        await rebaseCurrentOntoBranch(repository.rootPath, branch);
      }, syncViewMessage);
    }),
  );
}
