/**
 * Golden-file parity tests.
 *
 * The `.in.html` inputs and `.out.md` expectations are copied verbatim from
 * the Go library's testdata. Passing them means this port produces
 * byte-identical output to the Go implementation for those documents, which
 * is the strongest signal that the port is faithful.
 */

import { describe, expect, it } from "vitest";
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

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "golden");

function casesIn(folder: string): string[] {
  return readdirSync(join(goldenDir, folder))
    .filter((name) => name.endsWith(".in.html"))
    .map((name) => name.slice(0, -".in.html".length))
    .sort();
}

export function buildConverter(folder: string): Converter {
  const extraPlugins: Record<string, () => Plugin[]> = {
    commonmark: () => [],
    strikethrough: () => [newStrikethroughPlugin()],
    table: () => [newTablePlugin()],
  };

  const conv = new Converter({
    plugins: [newBasePlugin(), newCommonmarkPlugin(), ...extraPlugins[folder]!()],
  });

  if (folder === "commonmark") {
    // The Go golden test does the same: keeping `<!-- comment -->` as a raw
    // HTML block makes the fixtures much easier to read. To override the
    // "remove" setting from the base plugin it has to run *early*.
    conv.register.rendererFor("#comment", TagTypeBlock, renderAsHTML, PriorityEarly);
  }

  return conv;
}

function runSuite(folder: string): void {
  describe(folder, () => {
    const names = casesIn(folder);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      it(name, () => {
        const input = readFileSync(join(goldenDir, folder, `${name}.in.html`), "utf8");
        const expected = readFileSync(join(goldenDir, folder, `${name}.out.md`), "utf8");

        expect(buildConverter(folder).convertString(input)).toBe(expected);
      });
    }
  });
}

describe("golden files from the Go library", () => {
  runSuite("commonmark");
  runSuite("strikethrough");
  runSuite("table");
});
