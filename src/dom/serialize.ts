/**
 * Serializes a {@link Node} tree back to HTML.
 *
 * This is the equivalent of `html.Render()` from Go's
 * "golang.org/x/net/html" and follows the same escaping and void-element
 * rules so that plugins relying on it produce identical output.
 */

import { Node, NodeType } from "./node.js";

// Elements that never have a closing tag.
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Elements whose children are written literally, without escaping.
const rawTextElements = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "xmp",
]);

// Elements where a leading newline is swallowed by the parser and therefore
// has to be re-added when serializing.
const leadingNewlineElements = new Set(["pre", "listing", "textarea"]);

function escapeText(s: string): string {
  let out = "";
  for (const char of s) {
    switch (char) {
      case "&":
        out += "&amp;";
        break;
      case "'":
        // "&#39;" is shorter than "&apos;" and apos was not in HTML until HTML5.
        out += "&#39;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        // "&#34;" is shorter than "&quot;".
        out += "&#34;";
        break;
      case "\r":
        out += "&#13;";
        break;
      default:
        out += char;
    }
  }
  return out;
}

/**
 * Comments use a looser rule than text: a ">" only has to be escaped when it
 * could close the comment early, i.e. at the very start or right after a
 * "!" or "-".
 */
function escapeComment(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const char = s[i]!;
    if (char === "&") {
      out += "&amp;";
      continue;
    }
    if (char === ">") {
      const prev = i > 0 ? s[i - 1] : undefined;
      if (prev === undefined || prev === "!" || prev === "-") {
        out += "&gt;";
        continue;
      }
    }
    out += char;
  }
  return out;
}

function renderInto(parts: string[], node: Node): void {
  switch (node.type) {
    case NodeType.Text: {
      const parent = node.parent;
      if (parent !== null && parent.type === NodeType.Element && rawTextElements.has(parent.data)) {
        parts.push(node.data);
      } else {
        parts.push(escapeText(node.data));
      }
      return;
    }

    case NodeType.Comment:
      parts.push("<!--", escapeComment(node.data), "-->");
      return;

    case NodeType.Doctype: {
      parts.push("<!DOCTYPE ", escapeText(node.data), ">");
      return;
    }

    case NodeType.Document: {
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        renderInto(parts, child);
      }
      return;
    }

    case NodeType.Element:
      break;

    default:
      throw new Error(`html: cannot render a node of type ${node.type}`);
  }

  // - - - the start tag - - - //
  parts.push("<", node.data);
  for (const attr of node.attr) {
    parts.push(" ");
    if (attr.namespace) {
      parts.push(attr.namespace, ":");
    }
    parts.push(attr.key, '="', escapeText(attr.val), '"');
  }
  parts.push(">");

  if (voidElements.has(node.data)) {
    return;
  }

  // Add back a leading newline that the parser would otherwise swallow.
  if (leadingNewlineElements.has(node.data)) {
    const first = node.firstChild;
    if (first !== null && first.type === NodeType.Text && first.data.startsWith("\n")) {
      parts.push("\n");
    }
  }

  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    renderInto(parts, child);
  }

  parts.push("</", node.data, ">");
}

/** Renders the node (and its children) as an HTML string. */
export function render(node: Node): string {
  const parts: string[] = [];
  renderInto(parts, node);
  return parts.join("");
}
