#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { resolve } from "node:path";
import { App } from "./App.js";
import { discoverRepositories } from "./discovery.js";

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Git Branches TUI needs an interactive terminal (TTY). Run it from a terminal session.");
  }
  let restored = false;
  let interrupted = false;
  let app: ReturnType<typeof render> | undefined;
  const restoreTerminal = (): void => {
    if (restored) return;
    restored = true;
    process.stdout.write("\u001b[?1049l\u001b[?25h");
  };
  const handleSigint = (): void => {
    interrupted = true;
    restoreTerminal();
    app?.unmount();
    process.exitCode = 130;
  };
  process.stdout.write("\u001b[?1049h\u001b[?25l");
  process.once("SIGINT", handleSigint);
  try {
    const workspacePath = resolve(process.argv[2] ?? process.cwd());
    const repositories = await discoverRepositories(workspacePath);
    if (interrupted) return;
    const startRepository = repositories.length === 1 ? repositories[0] : undefined;
    app = render(<App repositories={repositories} startRepository={startRepository} />, { exitOnCtrlC: true });
    await app.waitUntilExit();
  } finally {
    process.removeListener("SIGINT", handleSigint);
    restoreTerminal();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
