import type { GraphCommit, GraphRef, RawGraphCommit } from "./gitLog";
import { parseDecorations } from "./gitLog";

export type { GraphCommit, GraphRef };

/**
 * Classic lane assignment over topo-ordered commits.
 * First parent continues the commit lane, extra parents open/merge lanes.
 * Output columns/links are enough to render each row standalone in SVG.
 */
export function assignLanes(rawCommits: RawGraphCommit[], remoteNames: string[] = []): GraphCommit[] {
  const lanes: (string | null)[] = [];

  return rawCommits.map((raw) => {
    let lane = lanes.indexOf(raw.hash);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(raw.hash);
    }

    const before = new Set<number>();
    lanes.forEach((hash, index) => {
      if (hash !== null) {
        before.add(index);
      }
    });

    const links: { from: number; to: number }[] = [];
    const [firstParent, ...otherParents] = raw.parents;

    if (firstParent) {
      const existing = lanes.indexOf(firstParent);
      if (existing !== -1 && existing !== lane) {
        links.push({ from: lane, to: existing });
        lanes[lane] = null;
      } else {
        lanes[lane] = firstParent;
      }
    } else {
      lanes[lane] = null;
    }

    for (const parent of otherParents) {
      const existing = lanes.indexOf(parent);
      if (existing !== -1) {
        links.push({ from: lane, to: existing });
        continue;
      }

      let slot = lanes.indexOf(null);
      if (slot === -1) {
        slot = lanes.length;
        lanes.push(parent);
      } else {
        lanes[slot] = parent;
      }
      links.push({ from: lane, to: slot });
    }

    const after = new Set<number>();
    lanes.forEach((hash, index) => {
      if (hash !== null) {
        after.add(index);
      }
    });

    const columns = [...new Set([...before, ...after, lane])].sort((a, b) => a - b);
    const { refs, isHead } = parseDecorations(raw.decorations, remoteNames);

    return {
      ...raw,
      refs,
      isHead,
      shortHash: raw.hash.slice(0, 7),
      lane,
      columns,
      links,
    };
  });
}
