/**
 * Parses HTML into the Go-shaped {@link Node} tree.
 *
 * parse5 implements the same HTML5 tree-construction algorithm as Go's
 * "golang.org/x/net/html", so both produce the same document structure
 * (including the implied html/head/body elements) for the same input. The
 * tree adapter in ./tree-adapter.ts has parse5 build our nodes as it parses,
 * so there is no second tree to walk and copy afterwards.
 */

import { parse as parse5Parse, parseFragment as parse5ParseFragment } from "parse5";
import { goTreeAdapter, type GoTreeAdapterMap } from "./tree-adapter.js";
import type { Node } from "./node.js";

/**
 * Parses a full HTML document. Mirrors `html.Parse()` in Go: the result is a
 * document node that always contains html > head + body.
 */
export function parse(html: string): Node {
  return parse5Parse<GoTreeAdapterMap>(html, { treeAdapter: goTreeAdapter });
}

/**
 * Parses an HTML fragment without inserting the implied html/head/body
 * elements. Useful when the input is known to be a snippet.
 */
export function parseFragment(html: string): Node {
  return parse5ParseFragment<GoTreeAdapterMap>(html, { treeAdapter: goTreeAdapter });
}
