import { RelativePattern, workspace } from "vscode";
import type { Disposable } from "vscode";

/** Debounce for .git filesystem bursts (commit/checkout/fetch touch many files). */
const WATCH_DEBOUNCE_MS = 500;

export function watchGitMetadata(
  repositoryRoot: string,
  onChange: () => void,
): Disposable {
  const pattern = new RelativePattern(repositoryRoot, ".git/{HEAD,refs/**,index}");
  const watcher = workspace.createFileSystemWatcher(pattern);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, WATCH_DEBOUNCE_MS);
  };

  const onCreate = watcher.onDidCreate(schedule);
  const onDelete = watcher.onDidDelete(schedule);
  const onModify = watcher.onDidChange(schedule);

  return {
    dispose(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      onCreate.dispose();
      onDelete.dispose();
      onModify.dispose();
      watcher.dispose();
    },
  };
}
