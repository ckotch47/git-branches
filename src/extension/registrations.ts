import type { ExtensionContext } from "vscode";
import { commands, window } from "vscode";
import { checkoutBranch } from "../application/branchActions/checkoutBranch";
import { createBranch } from "../application/branchActions/createBranch";
import { mergeBranch } from "../application/branchActions/mergeBranch";
import { updateContextKeys } from "../application/contextKeys";
import { deleteBranch } from "../application/branchActions/deleteBranch";
import { pullBranch } from "../application/branchActions/pullBranch";
import { rebaseCurrentOntoBranch } from "../application/branchActions/rebaseCurrentOntoBranch";
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
            title: `${title}: SSH passphrase`,
            prompt: "Enter SSH passphrase",
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
        await window.showErrorMessage(normalized.message);
        return;
      }
    }
  } catch (error) {
    const normalized = normalizeGitError(error);
    logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
    await window.showErrorMessage(normalized.message);
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

export function registerExtensions(context: ExtensionContext): void {
  const provider = new BranchViewProvider();
  const branchTreeView = window.createTreeView("branchManager.view", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const scmTreeView = window.createTreeView("branchManager.scmView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    branchTreeView,
    scmTreeView,
  );

  const syncViewMessage = (): void => {
    const message = provider.getViewMessage();
    branchTreeView.message = message;
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
      provider.refresh();
      syncViewMessage();
      await updateContextKeys(await provider.getSnapshot());
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

      await runAction(provider, "Push", async (auth) => {
        const snapshot = await provider.getSnapshot();
        const branch =
          item?.branch ?? snapshot?.branches.find((candidate) => candidate.isCurrent) ?? null;

        if (!branch || branch.isRemote) {
          return;
        }

        await pushBranch(repository.rootPath, branch.name, getRemoteName(branch), auth?.sshPassphrase);
      }, async (auth) => {
        const repository = provider.getRepository();
        if (repository) {
          await refreshRemoteBranches(repository.rootPath, auth?.sshPassphrase);
        }
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
