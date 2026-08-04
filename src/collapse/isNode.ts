import { Node } from "../dom/node.js";
import { nodeName } from "../dom/helpers.js";

const blockElements = new Set([
  "address", "article", "aside", "audio", "blockquote", "body", "canvas",
  "center", "dd", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "html", "isindex", "li", "main", "menu", "nav", "noframes",
  "noscript", "ol", "output", "p", "pre", "section", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul",
]);

// Note: Compared to the javascript implementation, "source" is removed.
const voidElements = new Set([
  "area", "base", "br", "col", "command", "embed", "hr", "img", "input",
  "keygen", "link", "meta", "param", "track", "wbr",
]);

export const defaultIsBlockNode = (node: Node): boolean => blockElements.has(nodeName(node));

export const defaultIsVoidNode = (node: Node): boolean => voidElements.has(nodeName(node));

export const defaultIsPreformattedNode = (node: Node): boolean => {
  // Note: Originally in the javascript version, this just checked for "pre".
  // It was changed to also return true for "code".
  const name = nodeName(node);
  return name === "pre" || name === "code";
};
