// Dev helper: shows the first difference between our output and the Go
// golden file, for one case or all of them.
//   npx vite-node scripts/diff-golden.ts [folder] [name]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Converter } from "../src/converter/converter.js";
import { newBasePlugin, renderAsHTML } from "../src/plugins/base/index.js";
import { newCommonmarkPlugin } from "../src/plugins/commonmark/index.js";
import { newStrikethroughPlugin } from "../src/plugins/strikethrough/index.js";
import { newTablePlugin } from "../src/plugins/table/index.js";
import { PriorityEarly, TagTypeBlock } from "../src/converter/types.js";
import type { Plugin } from "../src/converter/types.js";

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "golden");

const extra: Record<string, () => Plugin[]> = {
  commonmark: () => [],
  strikethrough: () => [newStrikethroughPlugin()],
  table: () => [newTablePlugin()],
};

const onlyFolder = process.argv[2];
const onlyName = process.argv[3];

let failed = 0;
for (const folder of Object.keys(extra)) {
  if (onlyFolder && folder !== onlyFolder) continue;

  const names = readdirSync(join(goldenDir, folder))
    .filter((n) => n.endsWith(".in.html"))
    .map((n) => n.slice(0, -".in.html".length))
    .sort();

  for (const name of names) {
    if (onlyName && name !== onlyName) continue;

    const input = readFileSync(join(goldenDir, folder, `${name}.in.html`), "utf8");
    const expected = readFileSync(join(goldenDir, folder, `${name}.out.md`), "utf8");

    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin(), ...extra[folder]!()],
    });
    if (folder === "commonmark") {
      conv.register.rendererFor("#comment", TagTypeBlock, renderAsHTML, PriorityEarly);
    }

    let actual: string;
    try {
      actual = conv.convertString(input);
    } catch (err) {
      console.log(`\n=== ${folder}/${name}: THREW ===\n${(err as Error).stack}`);
      failed++;
      continue;
    }

    if (actual === expected) continue;
    failed++;

    const a = actual.split("\n");
    const e = expected.split("\n");
    let i = 0;
    while (i < a.length && i < e.length && a[i] === e[i]) i++;

    console.log(`\n=== ${folder}/${name} — first diff at line ${i + 1} (of ${e.length} want / ${a.length} got) ===`);
    const from = Math.max(0, i - 2);
    for (let j = from; j < Math.min(Math.max(a.length, e.length), i + 5); j++) {
      if (a[j] === e[j]) {
        console.log(`   ${j + 1} | ${JSON.stringify(a[j] ?? null)}`);
      } else {
        console.log(`!! ${j + 1} | want ${JSON.stringify(e[j] ?? null)}`);
        console.log(`!! ${j + 1} | got  ${JSON.stringify(a[j] ?? null)}`);
      }
    }
  }
}

console.log(`\n${failed} failing case(s)`);
