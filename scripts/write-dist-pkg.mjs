// Marks dist/esm and dist/cjs with the right module system, so that Node
// interprets the emitted .js files correctly regardless of the root "type".
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const flavor = process.argv[2];
if (flavor !== "esm" && flavor !== "cjs") {
  throw new Error(`expected "esm" or "cjs" but got ${JSON.stringify(flavor)}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "dist", flavor);

mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "package.json"),
  JSON.stringify({ type: flavor === "esm" ? "module" : "commonjs" }, null, 2) + "\n",
);
