import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text as InkText, useApp, useInput } from "ink";
import type { BranchRef } from "../../../src/domain/branch.js";
import type { RepositoryContext } from "../../../src/domain/repository.js";
import { SimpleGitRepository } from "../../../src/infrastructure/git/simpleGitRepository.js";
import { normalizeGitError } from "../../../src/infrastructure/git/gitErrors.js";
import { runGit } from "../../../src/infrastructure/git/gitCli.js";
import { isWorkingTreeDirty, stashPop, stashPush } from "../../../src/infrastructure/git/workingTree.js";
import { buildSnapshot } from "../../../src/tree/snapshotBuilder.js";
import type { TreeSnapshot } from "../../../src/tree/treeModel.js";
import { formatAheadBehind, shortRemoteBranchName, sortBranchesForView, collectRemoteNames } from "../../../src/tree/branchFormat.js";
import { matchesBranchFilter, normalizeFilter } from "../../../src/tree/treeFilter.js";
import { checkoutBranch } from "../../../src/application/branchActions/checkoutBranch.js";
import { createBranch } from "../../../src/application/branchActions/createBranch.js";
import { createBranchFromBranch } from "../../../src/application/branchActions/createBranchFromBranch.js";
import { deleteBranch, isNotFullyMergedError } from "../../../src/application/branchActions/deleteBranch.js";
import { renameBranch } from "../../../src/application/branchActions/renameBranch.js";
import { pullBranch } from "../../../src/application/branchActions/pullBranch.js";
import { pushBranch } from "../../../src/application/branchActions/pushBranch.js";
import { mergeBranch, } from "../../../src/application/branchActions/mergeBranch.js";
import { rebaseCurrentOntoBranch } from "../../../src/application/branchActions/rebaseCurrentOntoBranch.js";
import { checkoutAndRebaseOntoBranch } from "../../../src/application/branchActions/checkoutAndRebaseOntoBranch.js";
import { resetBranchToRemote } from "../../../src/application/branchActions/resetBranchToRemote.js";
import { refreshRemoteBranches } from "../../../src/application/branchActions/refreshRemoteBranches.js";
import { abortMerge } from "../../../src/application/branchActions/abortMerge.js";
import { abortRebase } from "../../../src/application/branchActions/abortRebase.js";
import { deleteMergedBranches, listMergedBranches } from "../../../src/application/branchActions/deleteMergedBranches.js";
import { listGoneBranches, pruneGoneBranches } from "../../../src/application/branchActions/pruneGoneBranches.js";
import { describeMerge } from "../../../src/application/branchActions/mergeRisk.js";
import { collectGraphCommits, getRemoteNames } from "../../../src/graph/gitLog.js";
import { assignLanes } from "../../../src/graph/lanes.js";
import { listChangedFiles, listCommitFiles, showFileAtRevision } from "../../../src/graph/compare.js";
import { copyText, showFile, showFileDiff } from "./terminal.js";
import { gitMetadataSignature } from "./discovery.js";

interface Props { repositories: RepositoryContext[]; startRepository?: RepositoryContext; }
type ActionChoice = { label: string; group: string; run: () => Promise<void> };
type Dialog = { kind: "prompt"; title: string; value: string; password?: boolean } | { kind: "confirm"; title: string } | { kind: "select"; title: string; choices: string[]; index: number } | { kind: "actions"; title: string; query: string; choices: ActionChoice[]; index: number } | null;
type DialogResult = string | boolean | number | ActionChoice | null;
type Mode = "branches" | "commands" | "graph" | "commit" | "compare" | "file" | "diff";
type PaneFocus = "branches" | "graph";
type Pending = { resolve: (value: DialogResult) => void };
type BranchListRow =
  | { kind: "section"; key: string; label: string }
  | { kind: "folder"; key: string; label: string; depth: number }
  | { kind: "branch"; key: string; branch: BranchRef; label: string; depth: number; index: number };

const COMMANDS = [
  ["Refresh Git state", "refresh"], ["Create branch", "create"], ["New branch from selected", "createFrom"], ["Checkout selected", "checkout"],
  ["Delete selected", "delete"], ["Rename selected", "rename"], ["Pull selected/current", "pull"],
  ["Push selected/current", "push"], ["Fetch all remotes", "fetch"], ["Merge selected into current", "merge"],
  ["Rebase current onto selected", "rebase"], ["Checkout and rebase current onto selected", "checkoutRebase"],
  ["Reset selected to remote", "reset"], ["Abort merge", "abortMerge"], ["Abort rebase", "abortRebase"],
  ["Delete merged branches", "deleteMerged"], ["Prune gone upstream branches", "pruneGone"],
  ["Switch repository", "switchRepository"], ["Filter branches", "filter"], ["Toggle tree or flat branch view", "group"],
  ["Open commit graph", "graph"], ["Copy branch name", "copyBranch"], ["Copy commit SHA", "copySha"], ["Copy upstream", "copyUpstream"],
] as const;

export function App({ repositories, startRepository }: Props): React.JSX.Element {
  const [repository, setRepository] = useState<RepositoryContext | null>(startRepository ?? null);
  const [snapshot, setSnapshot] = useState<TreeSnapshot | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [grouping, setGrouping] = useState(true);
  const [mode, setMode] = useState<Mode>("branches");
  const [paneFocus, setPaneFocus] = useState<PaneFocus>("branches");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [commandIndex, setCommandIndex] = useState(0);
  const [graphMode, setGraphMode] = useState<"all" | "current">("all");
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState("");
  const [graphCommits, setGraphCommits] = useState<ReturnType<typeof assignLanes>>([]);
  const [graphSelected, setGraphSelected] = useState(0);
  const [commitFiles, setCommitFiles] = useState<Awaited<ReturnType<typeof listCommitFiles>>>([]);
  const [changedFiles, setChangedFiles] = useState<Awaited<ReturnType<typeof listChangedFiles>>>([]);
  const [compareHint, setCompareHint] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState("");
  const [contentScroll, setContentScroll] = useState(0);
  const [terminalSize, setTerminalSize] = useState({ columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 });
  const { exit } = useApp();
  const pending = useRef<Pending | null>(null);
  const backgroundRefresh = useRef(false);

  const ask = useCallback((next: Exclude<Dialog, null>): Promise<DialogResult> => new Promise((resolve) => {
    pending.current = { resolve };
    setDialog(next);
  }), []);
  const prompt = useCallback(async (title: string, initial = "", password = false): Promise<string | null> => {
    const value = await ask({ kind: "prompt", title, value: initial, password });
    return typeof value === "string" ? value : null;
  }, [ask]);
  const confirm = useCallback(async (title: string): Promise<boolean> => (await ask({ kind: "confirm", title })) === true, [ask]);
  const choose = useCallback(async (title: string, choices: string[]): Promise<number | null> => {
    if (choices.length === 0) return null;
    const value = await ask({ kind: "select", title, choices, index: 0 });
    return typeof value === "number" ? value : null;
  }, [ask]);
  const chooseAction = useCallback(async (title: string, choices: ActionChoice[]): Promise<ActionChoice | null> => {
    if (choices.length === 0) return null;
    const groupedChoices = groupActionChoices(choices);
    const value = await ask({ kind: "actions", title, query: "", choices: groupedChoices, index: 0 });
    return typeof value === "object" && value !== null && "run" in value ? value : null;
  }, [ask]);

  const refresh = useCallback(async (fetch = false): Promise<void> => {
    if (!repository) return;
    let fetchError: string | null = null;
    try {
      if (fetch) {
        try { await refreshRemoteBranches(repository.rootPath); }
        catch (error) { fetchError = errorText(error); }
      }
      const next = await buildSnapshot(new SimpleGitRepository(), repository);
      setSnapshot(next);
      if (fetch) setStatus(fetchError ? `Git state refreshed; remote fetch failed: ${fetchError}` : "Refreshed Git state and remotes");
    } catch (error) { setStatus(errorText(error)); }
  }, [repository]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const updateSize = (): void => setTerminalSize({ columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 });
    process.stdout.on("resize", updateSize);
    return () => { process.stdout.off("resize", updateSize); };
  }, []);
  useEffect(() => {
    if (repository || repositories.length < 2) return;
    let active = true;
    void (async () => {
      const index = await choose("Select Git repository", repositories.map((item) => `${item.displayName} — ${item.rootPath}`));
      if (active && index !== null) setRepository(repositories[index] ?? null);
    })();
    return () => { active = false; };
  }, [repository, repositories, choose]);

  useEffect(() => {
    if (!repository) return;
    let prior = "";
    let active = true;
    const poll = async (): Promise<void> => {
      if (!active || backgroundRefresh.current || busy) return;
      try {
        const signature = await gitMetadataSignature(repository.rootPath);
        if (prior && signature !== prior) {
          backgroundRefresh.current = true;
          await refresh();
          backgroundRefresh.current = false;
        }
        prior = signature;
      } catch { /* repository may be removed while selected */ }
    };
    const timer = setInterval(() => { void poll(); }, 800);
    void poll();
    return () => { active = false; clearInterval(timer); };
  }, [repository, refresh, busy]);

  const visibleBranches = useMemo(() => (snapshot?.branches ?? []).filter((branch) => matchesBranchFilter(branch, filter)), [snapshot, filter]);
  const branchList = useMemo(() => buildBranchList(visibleBranches, grouping), [visibleBranches, grouping]);
  const flatBranches = branchList.branches;
  const selectedBranch = flatBranches[selectedIndex] ?? null;
  const currentBranch = snapshot?.branches.find((branch) => branch.isCurrent) ?? null;

  useEffect(() => {
    if (!repository || !snapshot) {
      setGraphCommits([]);
      setGraphSelected(0);
      return;
    }
    let active = true;
    const selectedRef = selectedBranch?.name;
    setGraphFocus(null);
    setGraphMode("all");
    void (async () => {
      try {
        const raw = selectedRef
          ? await collectGraphCommits(repository.rootPath, { limit: 500, onlyRef: selectedRef })
          : [];
        const commits = assignLanes(raw, await getRemoteNames(repository.rootPath));
        if (active) {
          setGraphCommits(commits);
          setGraphSelected(0);
        }
      } catch (error) {
        if (active) {
          setGraphCommits([]);
          setStatus(errorText(error));
        }
      }
    })();
    return () => { active = false; };
  }, [repository?.rootPath, snapshot, selectedBranch?.name]);
  const availableCommands = useMemo(() => {
    const branch = selectedBranch;
    const isLocal = branch !== null && !branch.isRemote;
    const isNonCurrentLocal = isLocal && !branch.isCurrent;
    const normal = snapshot?.state === "normal";
    return COMMANDS.filter(([, action]) => {
      if (!repository) return false;
      switch (action) {
        case "createFrom": case "checkout": case "copyBranch": case "copySha": return Boolean(branch);
        case "delete": case "rename": return Boolean(isNonCurrentLocal);
        case "pull": case "push": case "reset": return Boolean(isLocal);
        case "merge": case "rebase": return Boolean(branch && !branch.isCurrent && normal);
        case "checkoutRebase": return Boolean(branch && currentBranch && !currentBranch.isRemote && normal && branch.name !== currentBranch.name);
        case "deleteMerged": return Boolean(currentBranch && normal);
        case "copyUpstream": return Boolean(isLocal && branch?.upstream);
        case "switchRepository": return repositories.length > 1;
        default: return true;
      }
    });
  }, [repository, selectedBranch, currentBranch, snapshot, repositories.length]);

  const run = useCallback(async (title: string, action: (passphrase?: string) => Promise<void>, options: { needsClean?: string; refreshRemotes?: boolean } = {}): Promise<void> => {
    if (!repository) return;
    let stashed = false;
    if (options.needsClean) {
      try {
        if (await isWorkingTreeDirty(repository.rootPath)) {
          if (!await confirm(`Uncommitted changes block ${options.needsClean}. Stash them and continue?`)) return;
          await stashPush(repository.rootPath);
          stashed = true;
          setStatus("Stashed local changes");
        }
      } catch (error) { setStatus(errorText(error)); return; }
    }
    let passphrase: string | undefined;
    let retried = false;
    setBusy(true);
    try {
      while (true) {
        try {
          await action(passphrase);
          setStatus(`${title} completed`);
          if (options.refreshRemotes) {
            try { await refreshRemoteBranches(repository.rootPath, passphrase); } catch (error) { setStatus(`${title} completed; remote refresh failed: ${errorText(error)}`); }
          }
          await refresh();
          break;
        } catch (error) {
          const normalized = normalizeGitError(error);
          if (normalized.code === "git_auth_error" && !retried) {
            const value = await prompt("Enter SSH passphrase", "", true);
            if (value !== null) { passphrase = value; retried = true; continue; }
          }
          setStatus(errorText(normalized));
          break;
        }
      }
    } finally {
      setBusy(false);
      if (stashed) {
        try { await stashPop(repository.rootPath); setStatus((value) => `${value}; stashed changes restored`); }
        catch (error) { setStatus(errorText(error)); }
        await refresh();
      }
    }
  }, [repository, confirm, prompt, refresh, status]);

  const withBranch = useCallback((required: boolean, operation: (branch: BranchRef) => Promise<void>): Promise<void> => {
    if (!repository) return Promise.resolve();
    const branch = selectedBranch;
    if (required && !branch) { setStatus("Select a branch first"); return Promise.resolve(); }
    return operation(branch!);
  }, [repository, selectedBranch]);

  const execute = useCallback(async (action: string): Promise<void> => {
    if (!repository) return;
    const root = repository.rootPath;
    try {
      switch (action) {
        case "refresh": await refresh(true); break;
        case "fetch": await run("Fetch all remotes", (pass) => refreshRemoteBranches(root, pass)); break;
        case "checkout": await withBranch(true, async (branch) => run(`Checkout ${branch.name}`, () => checkoutBranch(root, branch), { needsClean: "checkout" })); break;
        case "create": {
          const name = await prompt("Enter new branch name");
          if (name) await run(`Create branch ${name}`, () => createBranch(root, name));
          break;
        }
        case "createFrom": await withBranch(true, async (branch) => {
          const name = await prompt(`New branch name based on ${branch.name}`);
          if (name) await run(`Create ${name} from ${branch.name}`, () => createBranchFromBranch(root, branch, name));
        }); break;
        case "delete": await withBranch(true, async (branch) => {
          if (branch.isCurrent || branch.isRemote) return setStatus("Only non-current local branches can be deleted");
          if (!await confirm(`Delete branch \"${branch.name}\"?`)) return;
          try { await deleteBranch(root, branch.name); setStatus(`Deleted ${branch.name}`); await refresh(); }
          catch (error) {
            if (!isNotFullyMergedError(error)) throw error;
            if (await confirm(`Branch \"${branch.name}\" is not fully merged. Force delete? Commits will be lost.`)) {
              await run(`Force delete ${branch.name}`, () => deleteBranch(root, branch.name, true));
            }
          }
        }); break;
        case "rename": await withBranch(true, async (branch) => {
          if (branch.isCurrent || branch.isRemote) return setStatus("Only non-current local branches can be renamed");
          const name = await prompt(`Enter new name for ${branch.name}`, branch.name);
          if (name && name !== branch.name) await run(`Rename ${branch.name}`, () => renameBranch(root, branch.name, name));
        }); break;
        case "pull": {
          const branch = selectedBranch ?? currentBranch;
          if (!branch || branch.isRemote) return setStatus("Select a local branch or current branch");
          await run("Pull", (pass) => pullBranch(root, branch.name, remoteFor(branch), branch.isCurrent, pass));
          break;
        }
        case "push": {
          const branch = selectedBranch ?? currentBranch;
          if (!branch || branch.isRemote) return setStatus("Select a local branch or current branch");
          const remotes = await new SimpleGitRepository().getRemotes(root);
          const preferred = remoteFor(branch);
          const names = remotes.length <= 1
            ? [remotes[0] ?? preferred]
            : [preferred, ...remotes.filter((remote) => remote !== preferred)];
          const remoteIndex = names.length > 1 ? await choose("Select remote to push to", names) : 0;
          if (remoteIndex === null) return;
          const remote = names[remoteIndex] ?? preferred;
          await run(branch.upstream ? "Push" : `Publish ${branch.name}`, (pass) => pushBranch(root, branch.name, remote, pass, !branch.upstream), { refreshRemotes: true });
          break;
        }
        case "merge": await withBranch(true, async (branch) => {
          if (branch.isCurrent || snapshot?.state !== "normal") return setStatus("Select a non-current branch in a normal repository state");
          const current = snapshot.currentBranch ?? "current branch";
          const hint = await describeMerge(root, branch.name, current).catch(() => null);
          if (await confirm(`Merge ${branch.name} into ${current}?${hint ? ` (${hint})` : ""}`)) {
            await run(`Merge ${branch.name}`, () => mergeBranch(root, branch), { needsClean: "merge" });
          }
        }); break;
        case "rebase": await withBranch(true, async (branch) => {
          if (branch.isCurrent || snapshot?.state !== "normal") return setStatus("Select a non-current branch in a normal repository state");
          const current = snapshot.currentBranch ?? "current branch";
          if (await confirm(`Rebase ${current} onto ${branch.name}?`)) await run("Rebase", () => rebaseCurrentOntoBranch(root, branch), { needsClean: "rebase" });
        }); break;
        case "checkoutRebase": await withBranch(true, async (target) => {
          if (!currentBranch || currentBranch.isRemote || snapshot?.state !== "normal" || currentBranch.name === target.name) return setStatus("Select a different target branch in a normal repository state");
          if (await confirm(`Checkout ${target.name} and rebase ${currentBranch.name} onto it?`)) {
            await run("Checkout and rebase", () => checkoutAndRebaseOntoBranch(root, currentBranch.name, target), { needsClean: "checkout and rebase" });
          }
        }); break;
        case "reset": await withBranch(true, async (branch) => {
          if (branch.isRemote || snapshot?.state !== "normal") return setStatus("Reset requires a local branch in a normal repository state");
          const remote = branch.upstream ?? `origin/${branch.name}`;
          const counts = branch.ahead || branch.behind ? ` (local +${branch.ahead ?? 0}/-${branch.behind ?? 0})` : "";
          if (await confirm(`Reset ${branch.name}${counts} to ${remote}? Local commits will be lost.`)) await run("Reset to remote", async (pass) => { await resetBranchToRemote(root, branch, pass); }, { needsClean: branch.isCurrent ? "reset" : undefined });
        }); break;
        case "abortMerge": await run("Abort merge", () => abortMerge(root)); break;
        case "abortRebase": await run("Abort rebase", () => abortRebase(root)); break;
        case "deleteMerged": {
          if (!currentBranch || snapshot?.state !== "normal") return setStatus("Delete merged branches requires a current branch");
          const candidates = await listMergedBranches(root, currentBranch.name);
          if (!candidates.length) return setStatus("No merged branches to delete");
          if (await confirm(`Delete ${candidates.length} merged branches? ${candidates.join(", ")}`)) {
            await run("Delete merged branches", async () => {
              const result = await deleteMergedBranches(root, currentBranch.name);
              setStatus(`Deleted: ${result.deleted.join(", ") || "none"}. Skipped: ${result.skipped.join(", ") || "none"}.`);
            });
          }
          break;
        }
        case "pruneGone": {
          const candidates = await listGoneBranches(root);
          if (!candidates.length) return setStatus("No branches with gone upstream");
          if (await confirm(`Delete ${candidates.length} branches with gone upstream? ${candidates.join(", ")}`)) {
            await run("Prune gone branches", async () => {
              const result = await pruneGoneBranches(root);
              setStatus(`Deleted: ${result.deleted.join(", ") || "none"}. Skipped: ${result.skipped.join(", ") || "none"}.`);
            });
          }
          break;
        }
        case "filter": {
          const input = await prompt("Filter branches (empty clears)", filter ?? "");
          if (input !== null) { setFilter(normalizeFilter(input)); setSelectedIndex(0); }
          break;
        }
        case "group": {
          const nextGrouping = !grouping;
          const selectedName = selectedBranch?.name;
          const nextBranches = buildBranchList(visibleBranches, nextGrouping).branches;
          setGrouping(nextGrouping);
          const nextIndex = selectedName ? nextBranches.findIndex((branch) => branch.name === selectedName) : 0;
          setSelectedIndex(Math.max(0, nextIndex));
          setStatus(nextGrouping ? "Tree view enabled" : "Flat branch list enabled");
          break;
        }
        case "switchRepository": {
          const index = await choose("Select Git repository", repositories.map((item) => `${item.displayName} — ${item.rootPath}`));
          if (index !== null) {
            setRepository(repositories[index] ?? null);
            setSnapshot(null);
            setFilter(null);
            setSelectedIndex(0);
            setMode("branches");
            setGraphMode("all");
            setGraphFocus(null);
            setGraphFilter("");
            setGraphCommits([]);
            setGraphSelected(0);
            setCommitFiles([]);
            setChangedFiles([]);
            setCurrentFile("");
          }
          break;
        }
        case "graph": {
          setPaneFocus("graph"); setMode("branches");
          break;
        }
        case "copyBranch": await withBranch(true, async (branch) => setStatus(await copyText(branch.name))); break;
        case "copySha": await withBranch(true, async (branch) => {
          const sha = (await runGit(root, ["rev-parse", branch.name])).trim(); setStatus(await copyText(sha));
        }); break;
        case "copyUpstream": await withBranch(true, async (branch) => {
          if (!branch.upstream) return setStatus("This branch has no upstream");
          setStatus(await copyText(branch.upstream));
        }); break;
      }
    } catch (error) { setStatus(errorText(error)); }
  }, [repository, refresh, run, withBranch, selectedBranch, currentBranch, snapshot, filter, grouping, visibleBranches, repositories, prompt, confirm, choose, graphMode, graphFocus, exit]);

  useInput((input, key) => {
    if (dialog) {
      if (key.escape || (key.ctrl && input === "c")) {
        pending.current?.resolve(null); pending.current = null; setDialog(null); return;
      }
      if (dialog.kind === "prompt") {
        if (key.return) { pending.current?.resolve(dialog.value); pending.current = null; setDialog(null); }
        else if (key.backspace || key.delete) setDialog({ ...dialog, value: dialog.value.slice(0, -1) });
        else if (input && !key.ctrl && !key.meta && !key.tab) setDialog({ ...dialog, value: dialog.value + input });
      } else if (dialog.kind === "actions") {
        const filtered = filterActionChoices(dialog.choices, dialog.query);
        if (key.upArrow && filtered.length) setDialog({ ...dialog, index: (dialog.index + filtered.length - 1) % filtered.length });
        else if (key.downArrow && filtered.length) setDialog({ ...dialog, index: (dialog.index + 1) % filtered.length });
        else if (key.return && filtered[dialog.index]) { pending.current?.resolve(filtered[dialog.index]!); pending.current = null; setDialog(null); }
        else if (key.backspace || key.delete) setDialog({ ...dialog, query: dialog.query.slice(0, -1), index: 0 });
        else if (input && !key.ctrl && !key.meta && !key.tab) setDialog({ ...dialog, query: dialog.query + input, index: 0 });
      } else if (dialog.kind === "confirm") {
        if (key.return) { pending.current?.resolve(true); pending.current = null; setDialog(null); }
      } else if (dialog.kind === "select") {
        if (key.upArrow) setDialog({ ...dialog, index: (dialog.index + dialog.choices.length - 1) % dialog.choices.length });
        else if (key.downArrow) setDialog({ ...dialog, index: (dialog.index + 1) % dialog.choices.length });
        else if (key.return) { pending.current?.resolve(dialog.index); pending.current = null; setDialog(null); }
      }
      return;
    }
    if (busy) return;
    if (key.tab) {
      if (mode === "branches" || mode === "graph") {
        if (paneFocus === "branches") void openSelectedCommands();
        else void openGraphActions();
      } else if (mode === "commit") void openCommitActions();
      else if (mode === "compare") void openCompareActions();
      return;
    }
    if (mode === "commands") {
      if (key.escape) { setMode("branches"); return; }
      if (key.upArrow) setCommandIndex((value) => (value + availableCommands.length - 1) % Math.max(1, availableCommands.length));
      else if (key.downArrow) setCommandIndex((value) => (value + 1) % Math.max(1, availableCommands.length));
      else if (key.return) { const command = availableCommands[commandIndex]; if (command) void execute(command[1]); setMode("branches"); }
      return;
    }
    if (mode === "branches" || mode === "graph") {
      if (key.leftArrow) setPaneFocus("branches");
      else if (key.rightArrow) setPaneFocus("graph");
      else if (key.escape) {
        if (paneFocus === "graph") setPaneFocus("branches");
        else exit();
      }
      else if (key.upArrow) {
        if (paneFocus === "branches") setSelectedIndex((value) => Math.max(0, value - 1));
        else setGraphSelected((value) => Math.max(0, value - 1));
      }
      else if (key.downArrow) {
        if (paneFocus === "branches") setSelectedIndex((value) => Math.min(Math.max(0, flatBranches.length - 1), value + 1));
        else setGraphSelected((value) => Math.min(Math.max(0, visibleGraphCommits.length - 1), value + 1));
      }
      else if (key.return) {
        if (paneFocus === "branches") void execute("checkout");
        else void selectCommit();
      }
    } else if (mode === "commit" || mode === "compare") {
      if (key.escape) { setMode("branches"); setPaneFocus("graph"); }
      else if (mode === "commit" && key.upArrow) setSelectedIndex((value) => Math.max(0, value - 1));
      else if (mode === "commit" && key.downArrow) setSelectedIndex((value) => Math.min(Math.max(0, commitFiles.length - 1), value + 1));
      else if (mode === "commit" && key.return) void openSelectedFile();
      else if (mode === "compare" && key.upArrow) setSelectedIndex((value) => Math.max(0, value - 1));
      else if (mode === "compare" && key.downArrow) setSelectedIndex((value) => Math.min(Math.max(0, changedFiles.length - 1), value + 1));
      else if (mode === "compare" && key.return) void openSelectedDiff();
    } else if (mode === "file" || mode === "diff") {
      if (key.escape) setMode(mode === "file" ? "commit" : "compare");
      else if (key.upArrow) setContentScroll((value) => Math.max(0, value - 1));
      else if (key.downArrow) setContentScroll((value) => Math.min(Math.max(0, currentFile.split("\n").length - 1), value + 1));
      else if (key.pageUp) setContentScroll((value) => Math.max(0, value - Math.max(1, (process.stdout.rows ?? 24) - 8)));
      else if (key.pageDown) setContentScroll((value) => Math.min(Math.max(0, currentFile.split("\n").length - 1), value + Math.max(1, (process.stdout.rows ?? 24) - 8)));
    }
  });

  // Stable action callbacks used by graph screens.
  const reloadGraph = useCallback(async (): Promise<void> => {
    if (!repository) return;
    const raw = selectedBranch
      ? await collectGraphCommits(repository.rootPath, { limit: 500, onlyRef: selectedBranch.name })
      : [];
    setGraphCommits(assignLanes(raw, await getRemoteNames(repository.rootPath)));
    setGraphSelected(0);
  }, [repository, selectedBranch?.name]);
  const focusGraph = useCallback(async (): Promise<void> => {
    if (!repository) return;
    const choices = ["All branches", "Current branch", ...(snapshot?.branches ?? []).map((branch) => branch.name)];
    const selected = await choose("Focus graph on ref", choices);
    if (selected === null) return;
    const current = (await runGit(repository.rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "HEAD";
    const isCurrentMode = selected === 1;
    const ref = selected < 2 ? null : choices[selected] ?? null;
    setGraphFocus(ref); setGraphMode(isCurrentMode ? "current" : "all");
    const raw = await collectGraphCommits(repository.rootPath, { limit: 500, onlyRef: ref ?? (isCurrentMode ? current : undefined) });
    setGraphCommits(assignLanes(raw, await getRemoteNames(repository.rootPath)));
    setGraphSelected(0); setPaneFocus("graph"); setMode("branches");
  }, [choose, repository, snapshot]);
  const visibleGraphCommits = useMemo(() => {
    const query = graphFilter.trim().toLowerCase();
    if (!query) return graphCommits;
    return graphCommits.filter((commit) => `${commit.subject} ${commit.author} ${commit.hash} ${commit.refs.map((ref) => ref.name).join(" ")}`.toLowerCase().includes(query));
  }, [graphCommits, graphFilter]);
  const selectedCommit = visibleGraphCommits[graphSelected];
  const selectCommit = useCallback(async (): Promise<void> => {
    if (!repository || !selectedCommit) return;
    setCommitFiles(await listCommitFiles(repository.rootPath, selectedCommit.hash)); setSelectedIndex(0); setMode("commit");
  }, [repository, selectedCommit]);
  const compareGraph = useCallback(async (): Promise<void> => {
    if (!repository || !selectedCommit) return;
    const current = currentBranch?.name ?? "HEAD";
    const refs = (snapshot?.branches ?? []).map((branch) => branch.name).sort((left, right) => left.localeCompare(right));
    const initialRef = selectedCommit.refs.find((item) => item.kind !== "tag")?.name ?? selectedCommit.hash;
    const choices = refs.length ? refs : [initialRef];
    const chosen = await choose("Compare ref with current branch", choices);
    if (chosen === null) return;
    const ref = choices[chosen] ?? initialRef;
    const hint = await describeMerge(repository.rootPath, ref, current).catch(() => null);
    const files = await listChangedFiles(repository.rootPath, current, ref);
    setCompareHint(hint); setChangedFiles(files); setCurrentFile(ref); setSelectedIndex(0); setMode("compare");
  }, [repository, selectedCommit, currentBranch, snapshot, choose]);
  const checkoutGraphRef = useCallback(async (): Promise<void> => {
    if (!repository || !selectedCommit) return;
    const ref = selectedCommit.refs.find((item) => item.kind === "local" || item.kind === "remote" || item.kind === "head");
    if (!ref) return setStatus("Selected commit has no branch ref to check out");
    const isRemote = ref.kind === "remote";
    await run(`Checkout ${ref.name}`, () => checkoutBranch(repository.rootPath, { name: ref.name, displayName: ref.name, kind: isRemote ? "remote" : "local", isCurrent: false, isRemote }), { needsClean: "checkout" });
    await reloadGraph(); setPaneFocus("graph"); setMode("branches");
  }, [repository, selectedCommit, run, reloadGraph]);
  const checkoutCommitRef = useCallback(async (): Promise<void> => {
    if (!repository || !selectedCommit) return;
    const refs = selectedCommit.refs.filter((ref) => ref.kind === "local" || ref.kind === "remote" || ref.kind === "head");
    if (refs.length === 0) return setStatus("Selected commit has no branch ref to check out");
    const index = refs.length === 1 ? 0 : await choose("Select branch ref to check out", refs.map((ref) => ref.name));
    if (index === null) return;
    const ref = refs[index];
    if (!ref) return;
    const isRemote = ref.kind === "remote";
    await run(`Checkout ${ref.name}`, () => checkoutBranch(repository.rootPath, { name: ref.name, displayName: ref.name, kind: isRemote ? "remote" : "local", isCurrent: ref.kind === "head", isRemote }), { needsClean: "checkout" });
    await reloadGraph();
  }, [repository, selectedCommit, choose, run, reloadGraph]);
  const copyGraphSha = useCallback(async (): Promise<void> => { if (selectedCommit) setStatus(await copyText(selectedCommit.hash)); }, [selectedCommit]);
  const copyCommitShaSelected = useCallback(async (): Promise<void> => { if (selectedCommit) setStatus(await copyText(selectedCommit.hash)); }, [selectedCommit]);
  const copyCompareRef = useCallback(async (): Promise<void> => { setStatus(await copyText(currentFile)); }, [currentFile]);
  const openSelectedFile = useCallback(async (): Promise<void> => {
    if (!repository || !selectedCommit || !commitFiles[selectedIndex]) return;
    const entry = commitFiles[selectedIndex]!;
    setCurrentFile(await showFile(repository.rootPath, selectedCommit.hash, entry.path)); setContentScroll(0); setMode("file");
  }, [repository, selectedCommit, commitFiles, selectedIndex]);
  const openSelectedDiff = useCallback(async (): Promise<void> => {
    if (!repository || !changedFiles[selectedIndex]) return;
    const entry = changedFiles[selectedIndex]!;
    const base = currentBranch?.name ?? "HEAD";
    const target = currentFile;
    setCurrentFile(`${entry.path}\n\n${await showFileDiff(repository.rootPath, base, target, entry.path)}`); setContentScroll(0); setMode("diff");
  }, [repository, changedFiles, selectedIndex, currentBranch, currentFile]);
  const openSelectedCommands = useCallback(async (): Promise<void> => {
    const actions = availableCommands.map(([label, command]): ActionChoice => ({ label, group: branchActionGroup(command), run: () => execute(command) }));
    const action = await chooseAction(selectedBranch ? `Actions for ${selectedBranch.name}` : "Branch actions", actions);
    if (action) await action.run();
  }, [chooseAction, selectedBranch, execute, availableCommands]);

  const filterGraph = useCallback(async (): Promise<void> => {
    const value = await prompt("Filter commits (empty clears)", graphFilter);
    if (value !== null) { setGraphFilter(value); setGraphSelected(0); }
  }, [prompt, graphFilter]);
  const toggleGraphScope = useCallback(async (): Promise<void> => {
    const nextMode = graphMode === "all" ? "current" : "all";
    setGraphMode(nextMode); setGraphFocus(null);
    if (!repository) return;
    try {
      const current = (await runGit(repository.rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "HEAD";
      const raw = await collectGraphCommits(repository.rootPath, { limit: 500, onlyRef: nextMode === "current" ? current : undefined });
      setGraphCommits(assignLanes(raw, await getRemoteNames(repository.rootPath))); setGraphSelected(0);
    } catch (error) { setStatus(errorText(error)); }
  }, [graphMode, repository]);
  const openGraphActions = useCallback(async (): Promise<void> => {
    const actions: ActionChoice[] = [
      ...(selectedCommit ? [
        { label: "Open commit details", group: "Commit", run: selectCommit },
        { label: "Compare with branch", group: "Commit", run: compareGraph },
        { label: "Checkout branch ref", group: "Commit", run: checkoutGraphRef },
        { label: "Copy commit SHA", group: "Copy", run: copyGraphSha },
      ] : []),
      { label: "Focus graph", group: "Graph", run: focusGraph },
      { label: "Filter commits", group: "Graph", run: filterGraph },
      { label: "Toggle all/current commits", group: "Graph", run: toggleGraphScope },
      { label: "Refresh Git state", group: "Repository", run: () => execute("refresh") },
    ];
    const action = await chooseAction(selectedCommit ? "Actions for " + selectedCommit.shortHash : "Graph actions", actions);
    if (action) await action.run();
  }, [selectedCommit, chooseAction, selectCommit, compareGraph, focusGraph, checkoutGraphRef, copyGraphSha, filterGraph, toggleGraphScope, execute]);
  const openCommitActions = useCallback(async (): Promise<void> => {
    const actions: ActionChoice[] = [];
    if (commitFiles[selectedIndex]) actions.push({ label: "Open selected file", group: "Files", run: openSelectedFile });
    if (selectedCommit?.refs.some((ref) => ref.kind === "local" || ref.kind === "remote" || ref.kind === "head")) {
      actions.push({ label: "Checkout branch ref", group: "Commit", run: checkoutCommitRef });
    }
    actions.push({ label: "Copy commit SHA", group: "Copy", run: copyCommitShaSelected });
    const action = await chooseAction("Commit actions", actions);
    if (action) await action.run();
  }, [commitFiles, selectedIndex, selectedCommit, openSelectedFile, checkoutCommitRef, copyCommitShaSelected, chooseAction]);
  const openCompareActions = useCallback(async (): Promise<void> => {
    const actions: ActionChoice[] = [];
    if (changedFiles[selectedIndex]) actions.push({ label: "Open selected diff", group: "Files", run: openSelectedDiff });
    actions.push({ label: "Copy comparison ref", group: "Copy", run: copyCompareRef });
    const action = await chooseAction("Compare actions", actions);
    if (action) await action.run();
  }, [changedFiles, selectedIndex, openSelectedDiff, copyCompareRef, chooseAction]);

  const branchRows = branchList.rows.map((row) => {
    if (row.kind === "section") return <Text key={row.key} bold color="gray">{row.label}</Text>;
    if (row.kind === "folder") return <Text key={row.key} color="gray" wrap="truncate">  {"  ".repeat(row.depth)}{row.label}/</Text>;
    const selected = row.index === selectedIndex;
    const tracking = formatAheadBehind(row.branch);
    return <Text key={row.key} wrap="truncate" backgroundColor={selected && paneFocus === "branches" ? "blue" : undefined} color={selected ? paneFocus === "branches" ? "white" : "cyan" : undefined} bold={selected && paneFocus === "branches"}>{selected ? "› " : "  "}{"  ".repeat(row.depth)}{row.branch.isCurrent ? <Text color="green" bold>● HEAD </Text> : row.branch.isRemote ? <Text color="magenta">↳ </Text> : null}{row.label}{tracking ? <Text color={selected ? "white" : "gray"}>  {tracking}</Text> : ""}</Text>;
  });
  const selectedGraphCommit = visibleGraphCommits[graphSelected];
  const terminalRows = terminalSize.rows;
  const terminalColumns = terminalSize.columns;
  const panelWidth = Math.max(1, terminalColumns - 2);
  const sideBySide = terminalColumns >= 72;
  const workspaceWidth = panelWidth;
  const branchPaneWidth = sideBySide ? Math.max(24, Math.floor(workspaceWidth * 0.35)) : workspaceWidth;
  const graphPaneWidth = sideBySide ? workspaceWidth - branchPaneWidth : workspaceWidth;
  const selectedBranchDetails = selectedBranch
    ? [selectedBranch.upstream ? `upstream: ${selectedBranch.upstream}` : selectedBranch.isRemote ? "remote branch" : "no upstream", selectedBranch.lastCommitMessage || "No commit message"].join(" · ")
    : "";
  const detailRows = (mode === "branches" || mode === "graph") && selectedBranch ? 1 : 0;
  const maxContentRows = sideBySide ? Math.max(3, terminalRows - 14 - detailRows) : Math.max(3, Math.floor((terminalRows - 12 - detailRows) / 2));
  const contentCount = dialog
    ? dialog.kind === "select" ? dialog.choices.length + 2 : dialog.kind === "actions" ? dialog.choices.length + 3 : 3
    : mode === "branches" ? Math.max(3, branchRows.length)
      : mode === "commands" ? Math.max(3, availableCommands.length)
        : mode === "graph" ? Math.max(3, visibleGraphCommits.length + 1)
          : mode === "commit" ? Math.max(3, commitFiles.length)
            : mode === "compare" ? Math.max(3, changedFiles.length)
              : maxContentRows;
  const contentRows = mode === "branches" || mode === "graph"
    ? maxContentRows
    : Math.max(3, Math.min(maxContentRows, contentCount));
  const branchBodyRows = Math.max(1, contentRows - 2);
  const graphBodyRows = Math.max(1, contentRows - 3);
  const selectedBranchRow = Math.max(0, branchList.rows.findIndex((row) => row.kind === "branch" && row.index === selectedIndex));
  const branchWindow = visibleWindow(branchRows, selectedBranchRow, branchBodyRows);
  const commandRows = availableCommands.map(([label], index) => <Text key={label} wrap="truncate" backgroundColor={index === commandIndex ? "blue" : undefined} color={index === commandIndex ? "white" : undefined} bold={index === commandIndex}>{index === commandIndex ? "› " : "  "}{label}</Text>);
  const commandWindow = visibleWindow(commandRows, commandIndex, contentRows);
  const graphWindow = visibleWindow(visibleGraphCommits, graphSelected, graphBodyRows);
  const graphRows = graphWindow.items.map((commit, localIndex) => {
    const index = graphWindow.start + localIndex;
    const selected = index === graphSelected;
    return <Text key={commit.hash} wrap="truncate" backgroundColor={selected && paneFocus === "graph" ? "blue" : undefined} color={selected && paneFocus === "graph" ? "white" : undefined} bold={selected && paneFocus === "graph"}>{selected ? "› " : "  "}<Text color={commit.isHead ? "green" : "cyan"}>{"│ ".repeat(Math.min(commit.lane, 5))}{commit.isHead ? "●" : "○"} {commit.shortHash}</Text> {commit.subject} {commit.refs.map((ref) => `[${ref.name}]`).join(" ")}</Text>;
  });
  const fileRows = commitFiles.map((file, index) => <Text key={`${file.path}:${index}`} wrap="truncate" backgroundColor={index === selectedIndex ? "blue" : undefined} color={index === selectedIndex ? "white" : undefined} bold={index === selectedIndex}>{index === selectedIndex ? "› " : "  "}<Text color={file.status.startsWith("A") ? "green" : file.status.startsWith("D") ? "red" : "yellow"}>{file.status}</Text> {file.path} {file.additions !== undefined ? `+${file.additions} -${file.deletions ?? 0}` : ""}</Text>);
  const fileWindow = visibleWindow(fileRows, selectedIndex, contentRows);
  const compareRows = changedFiles.map((file, index) => <Text key={`${file.path}:${index}`} wrap="truncate" backgroundColor={index === selectedIndex ? "blue" : undefined} color={index === selectedIndex ? "white" : undefined} bold={index === selectedIndex}>{index === selectedIndex ? "› " : "  "}<Text color={file.status.startsWith("A") ? "green" : file.status.startsWith("D") ? "red" : "yellow"}>{file.status}</Text> {file.oldPath ? `${file.oldPath} → ` : ""}{file.path} {file.additions !== undefined ? `+${file.additions} -${file.deletions ?? 0}` : ""}</Text>);
  const compareWindow = visibleWindow(compareRows, selectedIndex, contentRows);
  const title = mode === "branches" ? "Branches" : mode === "commands" ? "Actions" : mode === "graph" ? "Commit graph" : mode === "commit" ? "Commit files" : mode === "compare" ? "Compare" : mode === "diff" ? "Diff" : "File at revision";
  const subtitle = mode === "branches"
    ? `${snapshot?.state === "detached" ? "Detached HEAD" : snapshot?.state === "empty" ? "No branches" : `${visibleBranches.length} branches`}${filter ? ` · filter: ${filter}` : ""}${grouping ? " · tree" : " · flat"}`
    : mode === "graph" ? `${graphFocus ? graphFocus : graphMode === "current" ? "Current branch" : "All refs"} · ${visibleGraphCommits.length}/${graphCommits.length} commits${graphFilter ? ` · ${graphFilter}` : ""}`
      : mode === "compare" ? `${currentBranch?.name ?? "HEAD"} ↔ ${currentFile}${compareHint ? ` · ${compareHint}` : ""}`
        : mode === "file" || mode === "diff" ? currentFile.split("\n", 1)[0] ?? "" : "";
  const hints = dialog?.kind === "prompt" ? "Type value   ↵ confirm   Esc cancel"
    : dialog?.kind === "confirm" ? "↵ confirm   Esc cancel"
      : dialog?.kind === "select" ? "↑↓ move   ↵ choose   Esc cancel"
        : dialog?.kind === "actions" ? "Type to search   ↑↓ move   ↵ run   Esc cancel"
        : mode === "branches" ? paneFocus === "branches"
          ? "←→ pane   ↑↓ branches   ↵ checkout   Tab actions   Esc quit"
          : "←→ pane   ↑↓ commits   ↵ details   Tab actions   Esc back"
          : mode === "commands" ? "↑↓ move   ↵ run   Esc back"
            : mode === "graph" ? "←→ pane   ↑↓ move   ↵ details   Tab actions"
              : mode === "commit" ? "↑↓ move   ↵ open file   Tab actions   Esc back"
                : mode === "compare" ? "↑↓ move   ↵ open diff   Tab actions   Esc back"
                  : "↑↓ scroll   PgUp/PgDn page   Esc back";
  return <Box flexDirection="column" paddingX={1} width={terminalColumns}>
    <Box justifyContent="space-between" flexDirection="row" paddingX={1}>
      <Text bold color="cyan">GIT BRANCHES</Text>
      <Text color={busy ? "yellow" : "green"} bold>{busy ? "● WORKING" : "● READY"}</Text>
    </Box>
    <Box paddingX={1}>
      <Text color="gray" wrap="truncate">{repository ? `${repository.displayName}  ·  ${repository.rootPath}` : "No repository selected"}</Text>
    </Box>
    {(mode === "branches" || mode === "graph") ? <Box flexDirection={sideBySide ? "row" : "column"} width={workspaceWidth}>
      <Box borderStyle="round" borderColor={paneFocus === "branches" ? "cyan" : "gray"} flexDirection="column" width={branchPaneWidth} paddingX={1} paddingY={0}>
        <Box flexDirection="column" height={contentRows} overflow="hidden">
          <Text bold color={paneFocus === "branches" ? "cyan" : undefined}>BRANCHES {paneFocus === "branches" ? "◀" : ""}</Text>
          <Text color="gray" wrap="truncate">{snapshot?.state === "detached" ? "Detached HEAD" : snapshot?.state === "empty" ? "No branches" : `${visibleBranches.length} branches`}{filter ? ` · filter: ${filter}` : ""}{grouping ? " · tree" : " · flat"}</Text>
          {dialog && paneFocus === "branches" ? <DialogView dialog={dialog} maxRows={branchBodyRows} />
            : !repository ? <Box flexDirection="column" paddingY={1}><Text color="yellow" bold>No Git repositories found</Text><Text color="gray" wrap="truncate">Run from a Git workspace.</Text><Text color="gray" wrap="truncate">npm run tui -- &lt;path&gt;</Text></Box>
                : !snapshot ? <Text color="gray">Loading branches…</Text>
                : branchRows.length ? branchWindow.items : <Text color="gray" wrap="truncate">No branches match filter.</Text>}
        </Box>
      </Box>
      <Box borderStyle="round" borderColor={paneFocus === "graph" ? "cyan" : "gray"} flexDirection="column" width={graphPaneWidth} paddingX={1} paddingY={0}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={paneFocus === "graph" ? "cyan" : undefined}>COMMIT GRAPH {paneFocus === "graph" ? "▶" : ""}</Text>
          <Text color="gray" wrap="truncate">{graphFocus ?? (selectedBranch?.name ?? "No branch")}</Text>
        </Box>
        <Text color="gray" wrap="truncate">{visibleGraphCommits.length}/{graphCommits.length} commits{graphFilter ? ` · ${graphFilter}` : ""}</Text>
        <Box flexDirection="column" height={graphBodyRows} overflow="hidden">
          {dialog && paneFocus === "graph" ? <DialogView dialog={dialog} maxRows={graphBodyRows} />
            : !repository ? <Text color="gray">Select or open a Git repository.</Text>
              : !snapshot ? <Text color="gray">Loading commit graph…</Text>
                : !selectedBranch ? <Text color="gray">Select a branch to view its graph.</Text>
                  : graphRows.length ? graphRows : <Text color="gray">No commits for this branch.</Text>}
        </Box>
        {selectedGraphCommit && <Text color="gray" wrap="truncate">{selectedGraphCommit.author} · {selectedGraphCommit.date} · {selectedGraphCommit.hash}</Text>}
      </Box>
    </Box> : <Box borderStyle="round" borderColor="gray" flexDirection="column" width={panelWidth} paddingX={1} paddingY={0}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>{title}</Text>
        {subtitle && <Text color="gray" wrap="truncate">{subtitle}</Text>}
      </Box>
      <Box flexDirection="column" height={contentRows} overflow="hidden">
        {dialog ? <DialogView dialog={dialog} maxRows={contentRows} />
          : mode === "commands" ? commandWindow.items
            : mode === "commit" ? fileWindow.items.length ? fileWindow.items : <Text color="gray">No files in this commit.</Text>
              : mode === "compare" ? compareWindow.items.length ? compareWindow.items : <Text color="gray">No changed files.</Text>
                : currentFile.split("\n").slice(contentScroll, contentScroll + Math.max(1, contentRows)).map((line, index) => <Text key={contentScroll + index} wrap="truncate" color={mode === "diff" && /^[+-]/.test(line) ? line.startsWith("+") ? "green" : "red" : undefined}>{line}</Text>)}
      </Box>
      {mode === "diff" && <Text color="gray" wrap="truncate">{currentFile.split("\n", 1)[0]}</Text>}
    </Box>}
    {(mode === "branches" || mode === "graph") && selectedBranch && <Box paddingX={1} width={panelWidth}><Text color="gray" wrap="truncate">{selectedBranchDetails}</Text></Box>}
    <Box borderStyle="round" borderColor={status.startsWith("Error:") ? "red" : "gray"} width={panelWidth} paddingX={1}>
      <Text color={status.startsWith("Error:") ? "red" : "gray"} wrap="truncate">{status}</Text>
    </Box>
    <Box paddingX={1}>
      <Text color="gray" dimColor wrap="truncate">{hints}</Text>
    </Box>
  </Box>;

  function DialogView({ dialog: current, maxRows }: { dialog: Exclude<Dialog, null>; maxRows: number }): React.JSX.Element {
    if (current.kind === "prompt") {
      const value = current.password ? "•".repeat(current.value.length) : current.value;
      const visibleCharacters = Math.max(8, terminalColumns - 8);
      const visibleValue = value.length > visibleCharacters ? `…${value.slice(-(visibleCharacters - 1))}` : value;
      return <Box flexDirection="column"><Text bold wrap="truncate">{current.title}</Text><Text wrap="truncate">{visibleValue}▌</Text></Box>;
    }
    if (current.kind === "confirm") return <Box flexDirection="column"><Text bold color="yellow" wrap="truncate">{current.title}</Text><Text>Confirm this action?</Text></Box>;
    if (current.kind === "actions") {
      const filtered = filterActionChoices(current.choices, current.query);
      if (filtered.length === 0) return <Box flexDirection="column"><Text bold wrap="truncate">{current.title}</Text><Text color="gray" wrap="truncate">Search: {current.query}▌</Text><Text color="gray">No matching actions.</Text></Box>;
      const rows: Array<{ kind: "group"; label: string } | { kind: "choice"; choice: ActionChoice; index: number }> = [];
      let previousGroup = "";
      filtered.forEach((choice, index) => {
        if (choice.group !== previousGroup) { rows.push({ kind: "group", label: choice.group }); previousGroup = choice.group; }
        rows.push({ kind: "choice", choice, index });
      });
      const selectedRow = rows.findIndex((row) => row.kind === "choice" && row.index === current.index);
      const window = visibleWindow(rows, selectedRow, Math.max(1, maxRows - 2));
      return <Box flexDirection="column"><Text bold wrap="truncate">{current.title}</Text><Text color="gray" wrap="truncate">Search: {current.query}▌ · {filtered.length} actions</Text>{window.items.map((row, offset) => {
        if (row.kind === "group") return <Text key={`group:${window.start + offset}`} color="cyan" bold wrap="truncate">{row.label}</Text>;
        const selected = row.index === current.index;
        return <Text key={`action:${row.index}`} wrap="truncate" backgroundColor={selected ? "blue" : undefined} color={selected ? "white" : undefined} bold={selected}>{selected ? "› " : "  "}{row.choice.label}</Text>;
      })}</Box>;
    }
    const choiceWindow = visibleWindow(current.choices, current.index, Math.max(1, maxRows - 2));
    return <Box flexDirection="column"><Text bold wrap="truncate">{current.title} · {current.index + 1}/{current.choices.length}</Text>{choiceWindow.items.map((choice, offset) => {
      const index = choiceWindow.start + offset;
      const selected = index === current.index;
      return <Text key={`${index}:${choice}`} wrap="truncate" backgroundColor={selected ? "blue" : undefined} color={selected ? "white" : undefined} bold={selected}>{selected ? "› " : "  "}{choice}</Text>;
    })}</Box>;
  }

}

function buildBranchList(branches: BranchRef[], tree: boolean): { rows: BranchListRow[]; branches: BranchRef[] } {
  const rows: BranchListRow[] = [];
  const orderedBranches: BranchRef[] = [];
  const appendSection = (label: string, sectionBranches: BranchRef[], branchLabel: (branch: BranchRef) => string): void => {
    if (sectionBranches.length === 0) return;
    rows.push({ kind: "section", key: "section:" + label, label });
    const sorted = sortBranchesForView(sectionBranches);
    if (!tree) {
      for (const branch of sorted) {
        const index = orderedBranches.push(branch) - 1;
        rows.push({ kind: "branch", key: (branch.isRemote ? "branch:remote:" : "branch:local:") + branch.name, branch, label: branchLabel(branch), depth: 0, index });
      }
      return;
    }
    type Node = { label: string; branch?: BranchRef; children: Map<string, Node>; firstRank: number };
    const root = new Map<string, Node>();
    for (let rank = 0; rank < sorted.length; rank += 1) {
      const branch = sorted[rank]!;
      const segments = branchLabel(branch).split("/").filter(Boolean);
      let children = root;
      for (let position = 0; position < segments.length; position += 1) {
        const segment = segments[position]!;
        let node = children.get(segment);
        if (!node) {
          node = { label: segment, children: new Map(), firstRank: rank };
          children.set(segment, node);
        }
        node.firstRank = Math.min(node.firstRank, rank);
        if (position === segments.length - 1) node.branch = branch;
        children = node.children;
      }
    }
    const emit = (nodes: Map<string, Node>, depth: number, parentKey: string): void => {
      const orderedNodes = [...nodes.values()].sort((left, right) => left.firstRank - right.firstRank || left.label.localeCompare(right.label));
      for (const node of orderedNodes) {
        const key = parentKey + "/" + node.label;
        if (node.branch) {
          const index = orderedBranches.push(node.branch) - 1;
          rows.push({ kind: "branch", key: (node.branch.isRemote ? "branch:remote:" : "branch:local:") + node.branch.name, branch: node.branch, label: node.label, depth, index });
        } else {
          rows.push({ kind: "folder", key: "folder:" + label + key, label: node.label, depth });
          emit(node.children, depth + 1, key);
        }
      }
    };
    emit(root, 0, label);
  };
  const locals = branches.filter((branch) => !branch.isRemote);
  appendSection("Local", locals, (branch) => branch.displayName);
  for (const remote of collectRemoteNames(branches)) {
    const remoteBranches = branches.filter((branch) => branch.isRemote && (branch.remoteName ?? branch.name.split("/")[0]) === remote);
    appendSection(remote, remoteBranches, (branch) => {
      const prefix = remote + "/";
      return branch.name.startsWith(prefix) ? branch.name.slice(prefix.length) : shortRemoteBranchName(branch.name);
    });
  }
  return { rows, branches: orderedBranches };
}

function visibleWindow<T>(items: T[], selectedIndex: number, limit: number): { items: T[]; start: number } {
  if (items.length === 0) return { items: [], start: 0 };
  const size = Math.max(1, Math.min(items.length, limit));
  const selected = Math.max(0, Math.min(items.length - 1, selectedIndex));
  const start = Math.max(0, Math.min(items.length - size, selected - Math.floor(size / 2)));
  return { items: items.slice(start, start + size), start };
}

function branchActionGroup(command: string): string {
  if (["create", "createFrom", "checkout", "delete", "rename"].includes(command)) return "Branch";
  if (["refresh", "fetch", "pull", "push"].includes(command)) return "Sync";
  if (["merge", "rebase", "checkoutRebase", "reset", "abortMerge", "abortRebase", "deleteMerged", "pruneGone"].includes(command)) return "Integrate";
  if (["switchRepository"].includes(command)) return "Repository";
  if (["filter", "group", "graph"].includes(command)) return "View";
  return "Copy";
}

function groupActionChoices(choices: ActionChoice[]): ActionChoice[] {
  const order = ["Branch", "Sync", "Integrate", "View", "Commit", "Files", "Graph", "Repository", "Copy"];
  const groups = [...new Set(choices.map((choice) => choice.group))];
  groups.sort((left, right) => {
    const leftRank = order.indexOf(left);
    const rightRank = order.indexOf(right);
    return (leftRank < 0 ? order.length : leftRank) - (rightRank < 0 ? order.length : rightRank) || left.localeCompare(right);
  });
  return groups.flatMap((group) => choices.filter((choice) => choice.group === group));
}

function filterActionChoices(choices: ActionChoice[], query: string): ActionChoice[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return choices;
  return choices.filter((choice) => `${choice.group} ${choice.label}`.toLocaleLowerCase().includes(normalized));
}

/** Prevent repository-controlled text from emitting terminal control sequences. */
function Text(props: React.ComponentProps<typeof InkText>): React.JSX.Element {
  return <InkText {...props}>{sanitizeTerminalNode(props.children)}</InkText>;
}

function sanitizeTerminalNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return node.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "");
  if (Array.isArray(node)) return React.Children.toArray(node).map(sanitizeTerminalNode);
  if (React.isValidElement(node) && node.props && typeof node.props === "object" && "children" in node.props) {
    return React.cloneElement(node, undefined, sanitizeTerminalNode((node.props as { children?: React.ReactNode }).children));
  }
  return node;
}

function remoteFor(branch: BranchRef): string {
  return branch.upstream?.split("/")[0] || branch.remoteName || "origin";
}
function errorText(error: unknown): string {
  const normalized = normalizeGitError(error);
  const detail = normalized.details?.split("\n").map((line) => line.trim()).find(Boolean);
  return `Error: [${normalized.code}] ${normalized.message}${detail ? `: ${detail}` : ""}`;
}
async function openGraph(root: string, graphMode: "all" | "current", graphFocus: string | null, setGraphCommits: React.Dispatch<React.SetStateAction<ReturnType<typeof assignLanes>>>, setMode: React.Dispatch<React.SetStateAction<Mode>>): Promise<void> {
  const current = (await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "HEAD";
  const raw = await collectGraphCommits(root, { limit: 500, onlyRef: graphFocus ?? (graphMode === "current" ? current : undefined) });
  setGraphCommits(assignLanes(raw, await getRemoteNames(root)));
  setMode("graph");
}
