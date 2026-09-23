import { runGit } from "../../infrastructure/git/gitCli";

/**
 * Best-effort merge hint computed without touching the worktree.
 * Returns a short human line like "3 ahead, 1 behind main" or "already merged",
 * or null when it cannot be determined.
 */
export async function describeMerge(
  rootPath: string,
  source: string,
  target: string,
): Promise<string | null> {
  try {
    await runGit(rootPath, ["merge-base", "--is-ancestor", source, target]);
    return "already merged into target";
  } catch {
    // Not an ancestor — fall through to divergence counts.
  }

  try {
    const output = await runGit(rootPath, ["rev-list", "--left-right", "--count", `${target}...${source}`]);
    const [behindRaw = "0", aheadRaw = "0"] = output.trim().split(/\s+/);
    const ahead = Number.parseInt(aheadRaw, 10) || 0;
    const behind = Number.parseInt(behindRaw, 10) || 0;
    return `${ahead} ahead, ${behind} behind ${target}`;
  } catch {
    return null;
  }
}
