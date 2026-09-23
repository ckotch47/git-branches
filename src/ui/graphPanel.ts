import { ViewColumn, window, env, workspace } from "vscode";
import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { assignLanes, type GraphCommit } from "../graph/lanes";
import { collectGraphCommits, getRemoteNames } from "../graph/gitLog";
import { listChangedFiles, listCommitFiles, showFileAtRevision } from "../graph/compare";
import { describeMerge } from "../application/branchActions/mergeRisk";
import { checkoutBranch } from "../application/branchActions/checkoutBranch";
import { openDiffView } from "../infrastructure/vscode/diffLauncher";
import { normalizeGitError } from "../infrastructure/git/gitErrors";
import { logOutput } from "../infrastructure/vscode/outputChannel";
import { runGit } from "../infrastructure/git/gitCli";
import type { RepositoryContext } from "../domain/repository";

export type GraphMode = "all" | "current";

const GRAPH_LIMIT = 500;
const LANE_COLORS = ["#83a98b", "#7f9fca", "#c59b70", "#ad8db4", "#78a8aa", "#b3a66e", "#bf8585", "#8798bf"];

async function currentBranchName(rootPath: string): Promise<string> {
  try {
    return (await runGit(rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

function languageForPath(filePath: string): string | undefined {
  const ext = filePath.split(".").at(-1)?.toLowerCase();
  if (!ext || ext === filePath.toLowerCase()) {
    return undefined;
  }
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    json: "json", md: "markdown", py: "python", rs: "rust", go: "go", java: "java",
    yml: "yaml", yaml: "yaml", sh: "shellscript", html: "html", css: "css",
  };
  return map[ext];
}

export class GraphPanelManager implements Disposable {
  private panel: WebviewPanel | null = null;
  private repository: RepositoryContext | null = null;
  private mode: GraphMode = "all";
  private focusRef: string | null = null;
  private remotes: string[] = [];

  constructor(private readonly context: ExtensionContext) {}

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
  }

  setRepository(repository: RepositoryContext | null): void {
    this.repository = repository;
    if (this.panel) {
      void this.refresh();
    }
  }

  isOpen(): boolean {
    return this.panel !== null;
  }

  open(repository: RepositoryContext | null): void {
    if (repository) {
      this.repository = repository;
    }

    if (this.panel) {
      this.panel.reveal(ViewColumn.One);
      void this.refresh();
      return;
    }

    this.panel = window.createWebviewPanel("branchManager.graph", "Branch Graph", ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this.panel.webview.html = this.renderHtml();
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      null,
      this.context.subscriptions,
    );
    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel || !this.repository) {
      return;
    }

    try {
      const rootPath = this.repository.rootPath;
      this.remotes = await getRemoteNames(rootPath);
      const current = await currentBranchName(rootPath);
      const onlyRef = this.focusRef ?? (this.mode === "current" ? current : undefined);
      const raw = await collectGraphCommits(rootPath, { limit: GRAPH_LIMIT, onlyRef });
      const commits = assignLanes(raw, this.remotes);
      const maxColumns = commits.reduce((max, commit) => Math.max(max, commit.columns.length), 1);
      await this.panel.webview.postMessage({
        command: "data",
        commits,
        currentBranch: current,
        maxColumns,
        mode: this.mode,
        focusRef: this.focusRef,
        branches: await this.listBranchNames(rootPath, current),
        laneColors: LANE_COLORS,
      });
    } catch (error) {
      const normalized = normalizeGitError(error);
      logOutput(`[${normalized.code}] ${normalized.message}`);
      await this.panel.webview.postMessage({ command: "error", message: normalized.message });
    }
  }

  private async listBranchNames(
    rootPath: string,
    current: string,
  ): Promise<{ name: string; isRemote: boolean; isCurrent: boolean }[]> {
    try {
      const output = await runGit(rootPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"]);
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((name) => {
          const first = name.split("/")[0] ?? "";
          const isRemote = this.remotes.includes(first);
          return { name, isRemote, isCurrent: !isRemote && name === current };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  private isRemoteRef(ref: string): boolean {
    const first = ref.split("/")[0] ?? "";
    return this.remotes.includes(first);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!this.panel || !this.repository || typeof message !== "object" || message === null) {
      return;
    }

    const rootPath = this.repository.rootPath;
    const payload = message as Record<string, unknown>;

    try {
      switch (payload.command) {
        case "refresh": {
          await this.refresh();
          break;
        }
        case "mode": {
          this.mode = payload.mode === "current" ? "current" : "all";
          this.focusRef = null;
          await this.refresh();
          break;
        }
        case "focusRef": {
          const ref = String(payload.ref ?? "");
          this.focusRef = ref || null;
          if (!ref) {
            this.mode = "all";
          }
          await this.refresh();
          break;
        }
        case "select": {
          const hash = String(payload.hash ?? "");
          const files = await listCommitFiles(rootPath, hash);
          await this.panel.webview.postMessage({ command: "details", hash, files });
          break;
        }
        case "compare": {
          const ref = String(payload.ref ?? "");
          const current = await currentBranchName(rootPath);
          const hint = await describeMerge(rootPath, ref, current);
          const files = ref === current ? [] : await listChangedFiles(rootPath, current, ref);
          await this.panel.webview.postMessage({
            command: "compareResult",
            ref,
            base: current,
            hint,
            files,
          });
          break;
        }
        case "checkout": {
          const ref = String(payload.ref ?? "");
          const isRemote = this.isRemoteRef(ref);
          await checkoutBranch(rootPath, {
            name: ref,
            displayName: ref,
            kind: isRemote ? "remote" : "local",
            isCurrent: false,
            isRemote,
          });
          await this.refresh();
          break;
        }
        case "copy": {
          await env.clipboard.writeText(String(payload.text ?? ""));
          break;
        }
        case "openFile": {
          const rev = String(payload.rev ?? "");
          const filePath = String(payload.path ?? "");
          const content = await showFileAtRevision(rootPath, rev, filePath);
          await window.showTextDocument(
            await workspace.openTextDocument({ content, language: languageForPath(filePath) }),
          );
          break;
        }
        case "openDiff": {
          const base = String(payload.base ?? "");
          const target = String(payload.target ?? "");
          const filePath = String(payload.path ?? "");
          const [left, right] = await Promise.all([
            showFileAtRevision(rootPath, base, filePath).catch(() => ""),
            showFileAtRevision(rootPath, target, filePath).catch(() => ""),
          ]);
          await openDiffView(
            `${filePath} (${base} ↔ ${target})`,
            `${base}:${filePath}`,
            left,
            `${target}:${filePath}`,
            right,
            languageForPath(filePath),
          );
          break;
        }
      }
    } catch (error) {
      const normalized = normalizeGitError(error);
      logOutput(`[${normalized.code}] ${normalized.message}${normalized.details ? `\n${normalized.details}` : ""}`);
      await window.showErrorMessage(normalized.message);
    }
  }

  private renderHtml(): string {
    const nonce = `graph-${Date.now().toString(36)}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Branch Graph</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; display: flex; flex-direction: column; height: 100vh; }
  #toolbar { display: flex; gap: 8px; align-items: center; min-height: 52px; padding: 9px 16px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
  #toolbar button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding: 4px 10px; cursor: pointer; border-radius: 4px; }
  #toolbar button:hover, .actions button:hover, .rowactions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #toolbar button.icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px; padding: 0; line-height: 1; }
  #search, #branchPick { height: 30px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 9px; }
  #search { width: min(320px, 32vw); }
  #branchPick { max-width: 280px; min-width: 170px; }
  #meta { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 12px; white-space: nowrap; }
  #main { display: grid; grid-template-columns: minmax(420px, var(--graph-pane-width, 66%)) 8px minmax(320px, 1fr); flex: 1; min-height: 0; }
  #graph { min-width: 0; overflow: auto; padding: 0 0 20px 0; }
  #splitter { position: relative; z-index: 2; cursor: col-resize; touch-action: none; outline: none; }
  #splitter::after { content: ''; position: absolute; inset: 0 auto 0 3px; width: 1px; background: var(--vscode-panel-border); transition: background-color .12s ease, width .12s ease; }
  #splitter:hover::after, #splitter:focus-visible::after, #main.resizing #splitter::after { left: 2px; width: 3px; background: var(--vscode-focusBorder); }
  #main.resizing { user-select: none; }
  #main.resizing * { cursor: col-resize !important; }
  .thead, .row { display: grid; grid-template-columns: var(--gutter, 48px) 58px minmax(180px, 1fr) minmax(82px, 120px) minmax(112px, 124px); align-items: center; }
  .thead { position: sticky; top: 0; min-height: 34px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; z-index: 1; }
  .thead > span { padding: 7px 10px 7px 0; overflow: hidden; text-overflow: ellipsis; }
  .row { min-height: 34px; white-space: nowrap; cursor: pointer; position: relative; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 45%, transparent); }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .row.head .subject { font-weight: bold; }
  .rowactions { position: absolute; right: 8px; top: 4px; display: none; align-items: center; gap: 4px; padding: 2px; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 5px; box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent); }
  .row:hover .rowactions { display: flex; }
  .rowactions button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); padding: 2px 8px; font-size: 11px; cursor: pointer; border-radius: 3px; }
  .gutter { flex: none; }
  .cell { min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
  .row .cell:first-of-type { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .hash { opacity: 0.55; font-family: var(--vscode-editor-font-family, monospace); margin-right: 8px; }
  .pill { display: inline-block; border-radius: 8px; padding: 0 7px; margin-right: 4px; font-size: 11px; border: 1px solid; }
  .pill.head { border-color: #4caf50; color: #4caf50; font-weight: bold; }
  .pill.local { border-color: #42a5f5; color: #42a5f5; }
  .pill.remote { border-color: #888; color: #aaa; }
  .pill.tag { border-color: #ffee58; color: #ffee58; }
  .who { opacity: 0.6; margin-left: 8px; }
  #details { min-width: 0; border-left: 1px solid var(--vscode-panel-border); overflow: auto; padding: 18px 20px 24px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
  .detail-header { padding-bottom: 14px; border-bottom: 1px solid var(--vscode-panel-border); }
  .detail-kicker { margin-bottom: 6px; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
  #details h3 { margin: 0; font-size: 16px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
  #details .dim { color: var(--vscode-descriptionForeground); }
  #details ul { list-style: none; padding: 0; margin: 5px 0; }
  #details li { margin-left: 4px; padding: 1px 0; }
  #details li a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  #details li a:hover { text-decoration: underline; }
  .ftree { margin-top: 10px; font-size: 12px; }
  .ftree ul { list-style: none; margin: 2px 0; padding-left: 0; }
  .ftree ul ul { border-left: 1px solid var(--vscode-tree-indentGuidesStroke, var(--vscode-panel-border)); margin: 1px 0 2px 7px; padding-left: 11px; }
  .folder { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; min-height: 18px; padding: 2px 6px 2px 0; font-weight: 600; border-radius: 4px; }
  .folder:hover { background: var(--vscode-list-hoverBackground); }
  .folder::before { content: '⌄'; opacity: 0.7; width: 12px; flex: none; text-align: center; font-size: 14px; }
  .folder.collapsed::before { content: '▸'; }
  .folder.collapsed + ul { display: none; }
  .folder svg { flex: none; opacity: 0.8; }
  .folder .who { margin-left: auto; flex: none; border-radius: 8px; padding: 0 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 10px; line-height: 14px; }
  .folder .folder-stats { margin-left: 5px; flex: none; font-weight: normal; }
  .frow { display: flex; align-items: center; gap: 7px; min-height: 18px; padding: 2px 6px 2px 0; border-radius: 4px; }
  .frow:hover { background: var(--vscode-list-hoverBackground); }
  .status { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; flex: none; border: 1px solid currentColor; border-radius: 3px; font-size: 6px; line-height: 1; font-weight: 700; font-family: var(--vscode-editor-font-family, monospace); background: transparent; }
  .st-A { color: #4caf50; } .st-M { color: #e2c07f; } .st-D { color: #ef5350; } .st-R { color: #ba68c8; } .st-C { color: #26c6da; }
  .fname-A { color: #4caf50; } .fname-D { color: #ef5350; } .fname-M { color: #e2c07f; }
  .file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-stats { margin-left: auto; flex: none; white-space: nowrap; font-size: 11px; }
  .add { color: #4caf50; } .del { color: #ef5350; }
  .kv { display: grid; grid-template-columns: 82px minmax(0, 1fr); column-gap: 8px; row-gap: 5px; margin: 12px 0; font-size: 11px; }
  .kv dt { color: var(--vscode-descriptionForeground); }
  .kv dd { margin: 0; word-break: break-all; }
  .kv a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  .kv a:hover { text-decoration: underline; }
  .section-heading { display: flex; align-items: baseline; gap: 8px; margin: 16px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .actions { margin: 12px 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .actions button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding: 5px 9px; cursor: pointer; border-radius: 4px; }
  #empty { padding: 20px; opacity: 0.7; }
  @media (max-width: 980px) {
    #main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(220px, 1fr) minmax(220px, 42vh); }
    #splitter { display: none; }
    #details { border-left: 0; border-top: 1px solid var(--vscode-panel-border); }
  }
  @media (max-width: 620px) {
    #toolbar { gap: 6px; padding: 8px; flex-wrap: wrap; }
    #branchPick { min-width: 0; max-width: 48%; flex: 1; }
    #search { width: auto; min-width: 120px; flex: 1; }
    #meta { width: 100%; margin-left: 0; }
    .thead, .row { grid-template-columns: var(--gutter, 48px) 60px minmax(160px, 1fr) 130px; }
    .thead > span:nth-child(4), .row .author { display: none; }
  }
</style>
</head>
<body>
<div id="toolbar">
  <select id="branchPick" title="Show history of a branch"></select>
  <input id="search" type="text" placeholder="Filter by message, author, hash…">
  <button id="refreshBtn" class="icon" title="Refresh graph"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 8a5.6 5.6 0 1 1-1.7-4"/><polyline points="13.6,1.4 13.6,4.4 10.6,4.4"/></svg></button>
  <span id="meta"></span>
</div>
<div id="main">
  <div id="graph"></div>
  <div id="splitter" role="separator" aria-label="Resize graph and commit details" aria-orientation="vertical" aria-valuemin="40" aria-valuemax="80" aria-valuenow="66" tabindex="0" title="Drag to resize panels"></div>
  <div id="details"><div class="dim">Select a commit to see details.</div></div>
</div>
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();
  let commits = [];
  let currentBranch = '';
  let maxColumns = 1;
  let laneColors = [];
  let selectedHash = null;
  let branchList = [];
  const graphEl = document.getElementById('graph');
  const detailsEl = document.getElementById('details');
  const searchEl = document.getElementById('search');
  const branchPickEl = document.getElementById('branchPick');
  const metaEl = document.getElementById('meta');
  const mainEl = document.getElementById('main');
  const splitterEl = document.getElementById('splitter');

  function paneBounds() {
    const width = mainEl.clientWidth;
    const available = width - splitterEl.offsetWidth;
    return {
      min: Math.max(40, Math.ceil(420 / width * 100)),
      max: Math.min(80, Math.floor((available - 320) / width * 100)),
    };
  }
  function setPaneWidth(value) {
    if (mainEl.clientWidth <= 980) {
      mainEl.style.setProperty('--graph-pane-width', '66%');
      splitterEl.setAttribute('aria-valuenow', '66');
      splitterEl.setAttribute('aria-valuetext', 'Graph 66%, details 34%');
      return 66;
    }
    const bounds = paneBounds();
    const pct = Math.max(bounds.min, Math.min(bounds.max, value));
    mainEl.style.setProperty('--graph-pane-width', pct + '%');
    splitterEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    splitterEl.setAttribute('aria-valuetext', 'Graph ' + Math.round(pct) + '%, details ' + (100 - Math.round(pct)) + '%');
    return pct;
  }
  let graphPanePct = setPaneWidth(66);
  splitterEl.addEventListener('pointerdown', function(event) {
    if (event.button !== 0) { return; }
    event.preventDefault();
    splitterEl.setPointerCapture(event.pointerId);
    mainEl.classList.add('resizing');
  });
  splitterEl.addEventListener('pointermove', function(event) {
    if (!splitterEl.hasPointerCapture(event.pointerId)) { return; }
    const rect = mainEl.getBoundingClientRect();
    graphPanePct = setPaneWidth((event.clientX - rect.left) / rect.width * 100);
  });
  function stopResizing() { mainEl.classList.remove('resizing'); }
  splitterEl.addEventListener('pointerup', stopResizing);
  splitterEl.addEventListener('pointercancel', stopResizing);
  splitterEl.addEventListener('keydown', function(event) {
    const bounds = paneBounds();
    const step = event.shiftKey ? 8 : 2;
    if (event.key === 'ArrowLeft') { graphPanePct = setPaneWidth(graphPanePct - step); }
    else if (event.key === 'ArrowRight') { graphPanePct = setPaneWidth(graphPanePct + step); }
    else if (event.key === 'Home') { graphPanePct = setPaneWidth(bounds.min); }
    else if (event.key === 'End') { graphPanePct = setPaneWidth(bounds.max); }
    else { return; }
    event.preventDefault();
  });
  window.addEventListener('resize', function() { graphPanePct = setPaneWidth(graphPanePct); });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function color(lane) { return laneColors[lane % laneColors.length] || '#888'; }
  function x(lane) { return lane * 14 + 9; }

  function gutterSvg(c) {
    const w = Math.max(maxColumns, 1) * 14 + 4;
    let parts = [];
    for (const col of c.columns) {
      if (col === c.lane) { continue; }
      parts.push('<line x1="' + x(col) + '" y1="0" x2="' + x(col) + '" y2="34" stroke="' + color(col) + '" stroke-width="2" opacity="0.55"/>');
    }
    for (const link of c.links) {
      parts.push('<path d="M ' + x(link.from) + ' 17 C ' + x(link.from) + ' 27, ' + x(link.to) + ' 27, ' + x(link.to) + ' 34" stroke="' + color(link.from) + '" stroke-width="2" fill="none" opacity="0.8"/>');
    }
    parts.push('<line x1="' + x(c.lane) + '" y1="0" x2="' + x(c.lane) + '" y2="34" stroke="' + color(c.lane) + '" stroke-width="2" opacity="0.55"/>');
    parts.push('<circle cx="' + x(c.lane) + '" cy="17" r="4.5" fill="' + color(c.lane) + '" stroke="#000" stroke-opacity="0.45" stroke-width="1"/>');
    return '<svg class="gutter" width="' + w + '" height="34">' + parts.join('') + '</svg>';
  }

  function refPills(c) {
    return c.refs.map(function(r) {
      return '<span class="pill ' + r.kind + '">' + esc(r.name) + '</span>';
    }).join('');
  }

  function matches(c, q) {
    if (!q) { return true; }
    const hay = (c.subject + ' ' + c.author + ' ' + c.hash + ' ' + c.refs.map(function(r){return r.name;}).join(' ')).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function renderBranchPick(focusRef, mode, branches, current) {
    branchList = branches || [];
    const locals = branchList.filter(function(b){ return !b.isRemote; });
    const remotes = branchList.filter(function(b){ return b.isRemote; });
    function opt(value, label) { return '<option value="' + esc(value) + '">' + esc(label) + '</option>'; }
    branchPickEl.innerHTML =
      opt('', 'All branches') +
      opt('@current', 'Current branch (' + current + ')') +
      '<optgroup label="Local branches">' + locals.map(function(b){
        return opt(b.name, (b.isCurrent ? '● ' : '') + b.name);
      }).join('') + '</optgroup>' +
      '<optgroup label="Remote branches">' + remotes.map(function(b){ return opt(b.name, b.name); }).join('') + '</optgroup>';
    branchPickEl.value = focusRef || (mode === 'current' ? '@current' : '');
  }

  function fmtDate(iso) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(String(iso || '').replace(' ', 'T'));
    if (isNaN(d.getTime())) {
      return String(iso || '').slice(0, 16);
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function firstBranchRef(c) {
    const refs = branchRefs(c);
    return refs.length > 0 ? refs[0].name : '';
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const visible = commits.filter(function(c){ return matches(c, q); });
    metaEl.textContent = visible.length + ' / ' + commits.length + ' commits';
    graphEl.style.setProperty('--gutter', Math.max(48, Math.max(maxColumns, 1) * 14 + 4) + 'px');
    const head = '<div class="thead"><span></span><span>Commit</span><span>Subject</span><span>Author</span><span>Date</span></div>';
    if (visible.length === 0) {
      graphEl.innerHTML = head + '<div id="empty">No commits match the filter.</div>';
      return;
    }
    graphEl.innerHTML = head + visible.map(function(c) {
      const ref = firstBranchRef(c);
      const actions = '<span class="rowactions">' +
        (ref ? '<button data-act="checkout" data-ref="' + esc(ref) + '">Checkout</button>' +
          '<button data-act="compare" data-ref="' + esc(ref) + '">Compare</button>' : '') +
        '<button data-act="copy" data-text="' + c.hash + '">Copy SHA</button></span>';
      return '<div class="row' + (c.hash === selectedHash ? ' selected' : '') + (c.isHead ? ' head' : '') + '" data-hash="' + c.hash + '">' +
        gutterSvg(c) +
        '<span class="cell">' + c.shortHash + '</span>' +
        '<span class="cell subject">' + refPills(c) + esc(c.subject) + '</span>' +
        '<span class="cell author">' + esc(c.author || 'Unknown author') + '</span>' +
        '<span class="cell">' + esc(fmtDate(c.date)) + '</span>' + actions + '</div>';
    }).join('');
    graphEl.querySelectorAll('.row').forEach(function(row) {
      row.addEventListener('click', function(event) {
        const btn = event.target && event.target.closest ? event.target.closest('button') : null;
        if (btn) {
          const act = btn.getAttribute('data-act');
          if (act === 'copy') { vscode.postMessage({ command: 'copy', text: btn.getAttribute('data-text') }); }
          else if (act === 'checkout') { vscode.postMessage({ command: 'checkout', ref: btn.getAttribute('data-ref') }); }
          else if (act === 'compare') { vscode.postMessage({ command: 'compare', ref: btn.getAttribute('data-ref') }); }
          return;
        }
        selectedHash = row.getAttribute('data-hash');
        render();
        vscode.postMessage({ command: 'select', hash: selectedHash });
      });
    });
  }

  function branchRefs(c) {
    return c.refs.filter(function(r){ return r.kind === 'local' || r.kind === 'remote' || r.kind === 'head'; });
  }

  function showCommitDetails(c, files) {
    const refs = branchRefs(c);
    const buttons = refs.map(function(r) {
      return '<button data-act="checkout" data-ref="' + esc(r.name) + '">Checkout ' + esc(r.name) + '</button>' +
        '<button data-act="compare" data-ref="' + esc(r.name) + '">Compare vs ' + esc(currentBranch) + '</button>';
    }).join('');
    const parents = (c.parents || []).map(function(p) {
      return '<a data-parent="' + p + '">' + esc(p.slice(0, 7)) + '</a>';
    }).join(' ');
    const mail = function(name, email) {
      return esc(name) + (email ? ' &lt;' + esc(email) + '&gt;' : '');
    };
    detailsEl.innerHTML = '<div class="detail-header"><div class="detail-kicker">Commit ' + c.shortHash + '</div><h3>' + esc(c.subject) + '</h3></div>' +
      '<dl class="kv">' +
      '<dt>Commit</dt><dd>' + c.shortHash + '</dd>' +
      '<dt>Parents</dt><dd>' + (parents || '<span class="dim">—</span>') + '</dd>' +
      '<dt>Author</dt><dd>' + mail(c.author, c.authorEmail) + '</dd>' +
      '<dt>Author Date</dt><dd>' + esc(fmtDate(c.date)) + '</dd>' +
      '<dt>Committer</dt><dd>' + mail(c.committer || c.author, c.committerEmail || c.authorEmail) + '</dd>' +
      '<dt>Committer Date</dt><dd>' + esc(fmtDate(c.committerDate || c.date)) + '</dd>' +
      '</dl>' +
      '<div style="margin-top:4px">' + refPills(c) + '</div>' +
      (buttons ? '<div class="actions">' + buttons +
        '<button data-act="copy" data-text="' + c.hash + '">Copy SHA</button></div>' : '') +
      '<div class="section-heading">Files changed <span class="dim">' + files.length + '</span></div>' +
      fileTreeHtml(files, c.hash, (c.parents && c.parents[0]) || '');
    wireButtons();
    wireFileTree();
    detailsEl.querySelectorAll('a[data-parent]').forEach(function(a) {
      a.addEventListener('click', function() {
        selectedHash = a.getAttribute('data-parent');
        render();
        vscode.postMessage({ command: 'select', hash: selectedHash });
      });
    });
  }

  function statsHtml(f) {
    if (typeof f.additions !== 'number' && typeof f.deletions !== 'number') { return ''; }
    return ' <span class="dim">(</span><span class="add">+' + (f.additions || 0) + '</span>' +
      '<span class="dim"> | </span><span class="del">-' + (f.deletions || 0) + '</span><span class="dim">)</span>';
  }

  function fileTreeHtml(files, rev, base) {
    function makeDir() { return { dirs: {}, files: [], add: 0, del: 0 }; }
    const root = makeDir();
    const sorted = files.slice().sort(function(a, b){ return a.path.localeCompare(b.path); });
    for (const f of sorted) {
      const parts = f.path.split('/');
      let node = root;
      const chain = [root];
      for (let i = 0; i < parts.length - 1; i++) {
        node.dirs[parts[i]] = node.dirs[parts[i]] || makeDir();
        node = node.dirs[parts[i]];
        chain.push(node);
      }
      node.files.push(f);
      for (const n of chain) {
        n.add += f.additions || 0;
        n.del += f.deletions || 0;
      }
    }
    const folderSvg = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.1L6 1.5H1.5v13h13V3z" opacity="0.9"/></svg>';
    const fileSvg = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.55"><path d="M4 1h5l3 3v11H4V1zm5 1.5V5h2.5L9 2.5z"/></svg>';
    function aggHtml(node) {
      if (!node.add && !node.del) { return ''; }
      return ' <span class="dim">(</span><span class="add">+' + node.add + '</span>' +
        '<span class="dim"> | </span><span class="del">-' + node.del + '</span><span class="dim">)</span>';
    }
    function renderNode(node) {
      let html = '<ul>';
      const folders = Object.keys(node.dirs).sort();
      for (const folder of folders) {
        const child = node.dirs[folder];
        const count = countFiles(child);
        html += '<li><span class="folder" title="' + esc(folder) + '">' + folderSvg + esc(folder) +
          ' <span class="who" title="' + count + ' files">' + count + '</span><span class="folder-stats">' + aggHtml(child) + '</span></span>' + renderNode(child) + '</li>';
      }
      const leaves = node.files.slice().sort(function(a, b){ return a.path.localeCompare(b.path); });
      for (const f of leaves) {
        const label = f.oldPath ? esc(f.oldPath) + ' → ' + esc(f.path.split('/').pop()) : esc(f.path.split('/').pop());
        html += '<li class="frow"><span class="status st-' + esc(f.status) + '" title="' + esc(f.status) + '">' + esc(f.status) + '</span>' + fileSvg +
          ' <a class="file-name fname-' + esc(f.status) + '" title="' + esc(f.path) + '" data-rev="' + esc(rev) + '" data-base="' + esc(base || '') + '" data-path="' + esc(f.path) + '">' + label + '</a>' +
          '<span class="file-stats">' + statsHtml(f) + '</span></li>';
      }
      return html + '</ul>';
    }
    function countFiles(node) {
      let n = node.files.length;
      for (const k of Object.keys(node.dirs)) { n += countFiles(node.dirs[k]); }
      return n;
    }
    return '<div class="ftree">' + renderNode(root) + '</div>';
  }

  function wireButtons() {
    detailsEl.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const act = btn.getAttribute('data-act');
        if (act === 'copy') { vscode.postMessage({ command: 'copy', text: btn.getAttribute('data-text') }); }
        else if (act === 'checkout') { vscode.postMessage({ command: 'checkout', ref: btn.getAttribute('data-ref') }); }
        else if (act === 'compare') { vscode.postMessage({ command: 'compare', ref: btn.getAttribute('data-ref') }); }
      });
    });
  }

  function wireFileTree() {
    detailsEl.querySelectorAll('.folder').forEach(function(el) {
      el.addEventListener('click', function() { el.classList.toggle('collapsed'); });
    });
    detailsEl.querySelectorAll('a[data-path]').forEach(function(a) {
      a.addEventListener('click', function() {
        const filePath = a.getAttribute('data-path');
        const rev = a.getAttribute('data-rev');
        const base = a.getAttribute('data-base');
        if (base) {
          vscode.postMessage({ command: 'openDiff', base: base, target: rev, path: filePath });
        } else {
          vscode.postMessage({ command: 'openFile', rev: rev, path: filePath });
        }
      });
    });
  }

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'data') {
      commits = msg.commits; currentBranch = msg.currentBranch;
      maxColumns = msg.maxColumns; laneColors = msg.laneColors;
      renderBranchPick(msg.focusRef, msg.mode, msg.branches, msg.currentBranch);
      render();
    } else if (msg.command === 'details') {
      const c = commits.find(function(x){ return x.hash === msg.hash; });
      if (c) { showCommitDetails(c, msg.files || []); }
    } else if (msg.command === 'compareResult') {
      const files = msg.files || [];
      detailsEl.innerHTML = '<div class="detail-header"><div class="detail-kicker">Branch comparison</div><h3>Compare ' + esc(msg.base) + ' ↔ ' + esc(msg.ref) + '</h3></div>' +
        '<div class="dim" style="margin-top:10px">' + esc(msg.hint || '') + '</div>' +
        '<div class="section-heading">Files changed <span class="dim">' + files.length + '</span></div>' +
        fileTreeHtml(files, msg.ref, msg.base) +
        '<div class="actions"><button data-act="checkout" data-ref="' + esc(msg.ref) + '">Checkout ' + esc(msg.ref) + '</button></div>';
      wireButtons();
      wireFileTree();
    } else if (msg.command === 'error') {
      graphEl.innerHTML = '<div id="empty">' + esc(msg.message) + '</div>';
    }
  });

  document.getElementById('refreshBtn').addEventListener('click', function(){ vscode.postMessage({ command: 'refresh' }); });
  branchPickEl.addEventListener('change', function(){
    const value = branchPickEl.value;
    if (value === '' || value === '@current') {
      vscode.postMessage({ command: 'mode', mode: value === '@current' ? 'current' : 'all' });
    } else {
      vscode.postMessage({ command: 'focusRef', ref: value });
    }
  });
  searchEl.addEventListener('input', render);
})();
</script>
</body>
</html>`;
  }
}
