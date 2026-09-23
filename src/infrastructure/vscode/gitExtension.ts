import { extensions } from "vscode";
import type { Disposable } from "vscode";

/**
 * Best-effort subscription to the built-in Git extension state changes.
 * Never throws: if the Git extension is missing or its API changes,
 * the caller simply gets no subscription (filesystem watcher still works).
 */
export function subscribeGitExtension(onChange: () => void): Disposable | null {
  try {
    const gitExtension = extensions.getExtension<{ getAPI: (version: number) => unknown }>("vscode.git");
    if (!gitExtension) {
      return null;
    }

    const api = gitExtension.exports?.getAPI?.(1) as
      | { onDidChangeState?: { (listener: () => void): Disposable } }
      | undefined;
    if (!api || typeof api.onDidChangeState !== "function") {
      return null;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener = (): void => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        onChange();
      }, 500);
    };

    const subscription = (api.onDidChangeState as (listener: () => void) => Disposable)(listener);
    return {
      dispose(): void {
        if (timer) {
          clearTimeout(timer);
        }
        subscription.dispose();
      },
    };
  } catch {
    return null;
  }
}
