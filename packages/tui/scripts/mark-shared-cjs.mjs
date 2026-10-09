import { mkdir, writeFile } from "node:fs/promises";

const sharedOutput = new URL("../dist/src/", import.meta.url);
await mkdir(sharedOutput, { recursive: true });
await writeFile(new URL("package.json", sharedOutput), '{"type":"commonjs"}\n', "utf8");
