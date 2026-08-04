/**
 * Bridges parse5's AST to the Go-shaped {@link Node} tree.
 *
 * parse5 implements the same HTML5 tree-construction algorithm as Go's
 * "golang.org/x/net/html", so both produce the same document structure
 * (including the implied html/head/body elements) for the same input.
 */

import { parse as parse5Parse, parseFragment as parse5ParseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { Node, NodeType, type Attribute } from "./node.js";

type P5Node = DefaultTreeAdapterMap["node"];
type P5ParentNode = DefaultTreeAdapterMap["parentNode"];

function hasChildNodes(node: P5Node): node is P5ParentNode {
  return "childNodes" in node && Array.isArray((node as P5ParentNode).childNodes);
}

function convertAttrs(attrs: Array<{ name: string; value: string; namespace?: string }>): Attribute[] {
  return attrs.map((a) => {
    const attr: Attribute = { key: a.name, val: a.value };
    if (a.namespace) {
      attr.namespace = a.namespace;
    }
    return attr;
  });
}

function convert(p5: P5Node): Node | null {
  const name = p5.nodeName;

  let node: Node;
  if (name === "#document" || name === "#document-fragment") {
    node = new Node({ type: NodeType.Document, data: "" });
  } else if (name === "#text") {
    // parse5 exposes text content on `value`.
    return new Node({ type: NodeType.Text, data: (p5 as { value: string }).value });
  } else if (name === "#comment") {
    return new Node({ type: NodeType.Comment, data: (p5 as { data: string }).data });
  } else if (name === "#documentType") {
    // Go stores the doctype name in `Data`, e.g. "html" for `<!DOCTYPE html>`.
    return new Node({ type: NodeType.Doctype, data: (p5 as { name: string }).name });
  } else {
    const el = p5 as DefaultTreeAdapterMap["element"];
    node = new Node({
      type: NodeType.Element,
      // parse5 already lowercases HTML tag names, matching Go's behavior.
      data: el.tagName,
      namespace: el.namespaceURI === "http://www.w3.org/1999/xhtml" ? "" : (el.namespaceURI ?? ""),
      attr: convertAttrs(el.attrs ?? []),
    });
  }

  // Go keeps template contents as ordinary children, while parse5 parks them
  // in a separate `content` fragment that is not in childNodes.
  const tmplContent = (p5 as { content?: P5ParentNode }).content;
  if (tmplContent !== undefined) {
    for (const child of tmplContent.childNodes) {
      const converted = convert(child);
      if (converted !== null) {
        node.appendChild(converted);
      }
    }
  }

  if (hasChildNodes(p5)) {
    for (const child of p5.childNodes) {
      const converted = convert(child);
      if (converted !== null) {
        node.appendChild(converted);
      }
    }
  }

  return node;
}

/**
 * Parses a full HTML document. Mirrors `html.Parse()` in Go: the result is a
 * document node that always contains html > head + body.
 */
export function parse(html: string): Node {
  const doc = convert(parse5Parse(html));
  if (doc === null) {
    throw new Error("html: failed to parse document");
  }
  return doc;
}

/**
 * Parses an HTML fragment without inserting the implied html/head/body
 * elements. Useful when the input is known to be a snippet.
 */
export function parseFragment(html: string): Node {
  const doc = convert(parse5ParseFragment(html));
  if (doc === null) {
    throw new Error("html: failed to parse fragment");
  }
  return doc;
}
