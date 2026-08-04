/**
 * Port of internal/domutils — the DOM rewrites that run before rendering.
 *
 * HTML allows many structures that markdown cannot express. These passes
 * reshape the tree into something that *can* be rendered, e.g. by unwrapping
 * a `<strong>` nested inside another `<strong>`, or by turning a heading that
 * sits inside a link into bold text.
 */

import { Node, NodeType, newComment, newElement, newText } from "../dom/node.js";
import {
  allChildNodes,
  allNodes,
  getNextNeighborElement,
  getNextNeighborNode,
  getNextNeighborNodeExcludingOwnChild,
  getPrevNeighborNode,
  getPrevNeighborNodeExcludingOwnChild,
  nameIsBlockNode,
  nodeName,
  removeNode,
  unwrapNode,
  wrapNode,
} from "../dom/helpers.js";
import { trimSpace } from "./unicode.js";

type MatchFn = (node: Node) => boolean;
type MatchPairFn = (a: Node, b: Node) => boolean;

// - - - - - - - - - - - - - Text node lookup - - - - - - - - - - - - - //

function getNextTextNode(startNode: Node): Node | null {
  let node = getNextNeighborNodeExcludingOwnChild(startNode);

  while (node !== null) {
    if (node.type === NodeType.Text) {
      return node;
    }
    if (nodeName(node) === "span") {
      // A span has no special meaning. So we just skip it...
      node = getNextNeighborNode(node);
      continue;
    }
    return null;
  }
  return null;
}

function getPrevTextNode(startNode: Node): Node | null {
  let node = getPrevNeighborNodeExcludingOwnChild(startNode);

  while (node !== null) {
    if (node.type === NodeType.Text) {
      return node;
    }
    if (nodeName(node) === "span") {
      node = getPrevNeighborNode(node);
      continue;
    }
    return null;
  }
  return null;
}

// - - - - - - - - - - - - - Merge adjacent - - - - - - - - - - - - - //

function collectAdjacentNodes(node: Node, matchFn: MatchFn): Node[] {
  const collected: Node[] = [];

  let current = node.nextSibling;
  while (current !== null) {
    if (nodeName(current) === "span") {
      // A span has no special meaning. So we just skip it...
      current = getNextNeighborNode(current);
    } else if (matchFn(current)) {
      collected.push(current);
      current = getNextNeighborNodeExcludingOwnChild(current);
    } else {
      // Return the collected nodes
      return collected;
    }
  }

  return collected;
}

function mergeChildren(destinationNode: Node, nodes: Node[]): void {
  for (const node of nodes) {
    // We move all the children to the `destinationNode`.
    for (const child of allChildNodes(node)) {
      removeNode(child);
      destinationNode.appendChild(child);
    }
    removeNode(node);
  }
}

/** Merges e.g. `<b>a</b><b>b</b>` into a single `<b>ab</b>`. */
export function mergeAdjacent(doc: Node, matchFn: MatchFn): void {
  let node: Node | null = doc;

  while (node !== null) {
    if (matchFn(node)) {
      mergeChildren(node, collectAdjacentNodes(node, matchFn));
    }
    node = getNextNeighborElement(node);
  }
}

/** Combines text nodes that ended up next to each other. */
export function mergeAdjacentTextNodes(n: Node | null): void {
  if (n === null) {
    return;
  }

  let prev: Node | null = null;
  let c = n.firstChild;
  while (c !== null) {
    const next = c.nextSibling;
    if (c.type === NodeType.Text && prev !== null && prev.type === NodeType.Text) {
      // Combine adjacent text nodes
      prev.data += c.data;
      n.removeChild(c);
    } else {
      mergeAdjacentTextNodes(c);
      prev = c;
    }
    c = next;
  }
}

// - - - - - - - - - - - - - Redundant nodes - - - - - - - - - - - - - //

function hasSameTypeAncestor(n: Node, matchFn: MatchPairFn): boolean {
  if (!matchFn(n, n)) {
    return false;
  }

  for (let p = n.parent; p !== null; p = p.parent) {
    if (matchFn(n, p)) {
      return true;
    }
  }

  return false;
}

/** Unwraps a node that is nested inside another node of the same kind. */
export function removeRedundant(doc: Node, matchFn: MatchPairFn): void {
  for (const node of allNodes(doc)) {
    if (hasSameTypeAncestor(node, matchFn)) {
      unwrapNode(node);
    }
  }
}

// - - - - - - - - - - - - - Add space - - - - - - - - - - - - - //

function getFirstChildNode(startNode: Node, matchFn: MatchFn): Node | null {
  let node = startNode.firstChild;
  while (node !== null) {
    if (nodeName(node) === "span") {
      node = getNextNeighborNode(node);
    } else if (matchFn(node)) {
      return node;
    } else {
      return null;
    }
  }
  return null;
}

function getLastChildNode(startNode: Node, matchFn: MatchFn): Node | null {
  let node = startNode.lastChild;
  while (node !== null) {
    if (nodeName(node) === "span") {
      node = getPrevNeighborNode(node);
    } else if (matchFn(node)) {
      return node;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Adds a space next to an outer node when its first/last child is an inner
 * node, so that e.g. bold-around-code does not glue onto the neighboring word.
 */
export function addSpace(doc: Node, isOuterNode: MatchFn, isInnerNode: MatchFn): void {
  let node: Node | null = doc;

  while (node !== null) {
    if (isOuterNode(node)) {
      if (getFirstChildNode(node, isInnerNode) !== null) {
        const prev = getPrevTextNode(node);
        if (prev !== null) {
          prev.data = prev.data + " ";
        }
      }

      if (getLastChildNode(node, isInnerNode) !== null) {
        const next = getNextTextNode(node);
        if (next !== null) {
          next.data = " " + next.data;
        }
      }
    }

    node = getNextNeighborElement(node);
  }
}

// - - - - - - - - - - - - - Swap tags - - - - - - - - - - - - - //

function swapTagsOfNodes(node1: Node, node2: Node): void {
  if (node1.type !== NodeType.Element || node2.type !== NodeType.Element) {
    throw new Error("swap only works with element nodes");
  }

  const tempData = node1.data;
  const tempAttr = node1.attr;

  node1.data = node2.data;
  node1.attr = node2.attr;

  node2.data = tempData;
  node2.attr = tempAttr;
}

function isEmptyText(node: Node): boolean {
  return node.type === NodeType.Text && trimSpace(node.data) === "";
}

/**
 * Swaps an outer and inner tag, e.g. turning `<b><a>x</a></b>` into
 * `<a><b>x</b></a>` so the link renders correctly.
 */
export function swapTags(doc: Node, isOuterNode: MatchFn, isInnerNode: MatchFn): void {
  const finder = (node: Node): void => {
    if (isOuterNode(node)) {
      const children = allChildNodes(node).filter((child) => !isEmptyText(child));

      if (children.length === 1 && isInnerNode(children[0]!)) {
        swapTagsOfNodes(node, children[0]!);
        return;
      }
    }

    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      finder(child);
    }
  };
  finder(doc);
}

// - - - - - - - - - - - - - Fake spans - - - - - - - - - - - - - //

function isFakeSpan(node: Node): boolean {
  if (nodeName(node) !== "span") {
    return false;
  }

  let containsBlockNode = false;
  const finder = (n: Node): void => {
    if (containsBlockNode) {
      return;
    }
    if (nameIsBlockNode(nodeName(n))) {
      containsBlockNode = true;
      return;
    }
    for (let child = n.firstChild; child !== null; child = child.nextSibling) {
      finder(child);
    }
  };
  finder(node);

  return containsBlockNode;
}

/** Renames "span" nodes to "div" if any block element is found as a child. */
/**
 * Collects the tag name of every element in the tree.
 *
 * The pre-render transforms each walk the whole document looking for a handful
 * of tags, and most documents contain none of them. One pass to find out which
 * tags are actually there pays for itself by letting the rest be skipped.
 */
export function collectTagNames(doc: Node): Set<string> {
  const names = new Set<string>();
  const stack: Node[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === NodeType.Element) {
      names.add(node.data);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      stack.push(child);
    }
  }
  return names;
}

export function renameFakeSpans(doc: Node): void {
  const finder = (node: Node): void => {
    if (isFakeSpan(node)) {
      node.data = "div";
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      finder(child);
    }
  };
  finder(doc);
}

// - - - - - - - - - - - - - Empty code - - - - - - - - - - - - - //

function hasTextChildNodes(startNode: Node): boolean {
  let found = false;
  const finder = (node: Node): void => {
    if (found) {
      return;
    }
    if (node.type === NodeType.Text && node.data !== "") {
      found = true;
      return;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      finder(child);
    }
  };
  finder(startNode);
  return found;
}

export function removeEmptyCode(doc: Node): void {
  let node: Node | null = doc;
  while (node !== null) {
    if (nodeName(node) === "code" && !hasTextChildNodes(node)) {
      const next = getNextNeighborNodeExcludingOwnChild(node);
      removeNode(node);
      node = next;
      continue;
    }
    node = getNextNeighborNode(node);
  }
}

// - - - - - - - - - - - - - List end comments - - - - - - - - - - - - - //

export const LIST_END_COMMENT_DATA = "THE END";

function nameIsList(node: Node): boolean {
  const name = nodeName(node);
  return name === "ul" || name === "ol";
}

function nextNameIsList(startNode: Node): boolean {
  let node = getNextNeighborNodeExcludingOwnChild(startNode);

  while (node !== null) {
    const name = nodeName(node);
    if (name === "ul" || name === "ol") {
      return true;
    }
    if (name === "li") {
      return false;
    }
    if (name === "#comment" && node.data === LIST_END_COMMENT_DATA) {
      return false;
    }

    // If there is any text between two lists
    // they are automatically not connected anymore.
    if (node.type === NodeType.Text) {
      return false;
    }

    if (name === "hr") {
      // A divider already separates two lists...
      return false;
    }

    node = getNextNeighborNode(node);
  }
  return false;
}

function insertComment(listNode: Node): void {
  const comment = newComment(LIST_END_COMMENT_DATA);
  listNode.parent?.insertBefore(comment, listNode.nextSibling);
}

/**
 * Two lists directly after each other would be parsed as one list. A comment
 * between them keeps them apart.
 */
export function addListEndComments(doc: Node): void {
  let node: Node | null = doc;
  while (node !== null) {
    if (nameIsList(node) && nextNameIsList(node)) {
      insertComment(node);
    }
    node = getNextNeighborElement(node);
  }
}

// - - - - - - - - - - - - - List items - - - - - - - - - - - - - //

/** Moves non-"li" nodes into the previous "li" node. */
export function moveListItems(n: Node): void {
  if (n.type === NodeType.Element && (n.data === "ol" || n.data === "ul")) {
    let previousLi: Node | null = null;

    // Collect children to avoid modifying the list while iterating.
    for (const child of allChildNodes(n)) {
      if (child.type === NodeType.Element && child.data === "li") {
        previousLi = child;
      } else if (child.type === NodeType.Text && trimSpace(child.data) === "") {
        // Skip the node, probably just formatting of the source code
      } else {
        // We expect that inside an "ol"/"ul" there are *only* "li" nodes.
        // But sometimes that is not the case...
        if (previousLi !== null) {
          // There is a previous "li" node,
          // so we move this content into the other "li" node.
          n.removeChild(child);
          previousLi.appendChild(child);
        } else {
          // There is no previous "li" node,
          // so we wrap this node with its own "li" node.
          previousLi = wrapNode(child, newElement("li"));
        }
      }
    }
  }

  for (const child of allChildNodes(n)) {
    moveListItems(child);
  }
}

// - - - - - - - - - - - - - Leaf block alternatives - - - - - - - - - - - - - //

function getMarkdownStructure(name: string): string {
  switch (name) {
    case "#document":
    case "html":
    case "head":
    case "body":
    case "blockquote":
    case "ul":
    case "ol":
    case "li":
      // A container block can also contain other blocks.
      return "container_block";

    // Note: "p" would also be part of "leaf_block"
    case "hr":
    case "pre":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      // Leaf blocks can contain inline content but NOT other blocks.
      return "leaf_block";

    case "#text":
    case "span":
    case "code":
    case "b":
    case "strong":
    case "i":
    case "em":
    case "a":
    case "img":
    case "br":
      return "inline";

    default:
      // "div" and "p" just place newlines, so they are not categorized.
      return "";
  }
}

function headingAlternative(node: Node): void {
  node.data = "strong";
  node.parent?.insertBefore(newElement("br"), node.nextSibling);
}

function blockquoteAlternative(node: Node): void {
  const parent = node.parent;
  if (parent === null) {
    return;
  }
  parent.insertBefore(newText(' "'), node);
  node.data = "span";
  parent.insertBefore(newText('" '), node.nextSibling);
}

function preAlternative(node: Node): void {
  node.data = "code";
}

function hrAlternative(node: Node): void {
  removeNode(node);
}

const alternatives: Record<string, (node: Node) => void> = {
  h1: headingAlternative,
  h2: headingAlternative,
  h3: headingAlternative,
  h4: headingAlternative,
  h5: headingAlternative,
  h6: headingAlternative,
  blockquote: blockquoteAlternative,
  pre: preAlternative,
  hr: hrAlternative,
};

/**
 * A block inside an inline element (or inside a leaf block) is not valid
 * markdown. Instead of rendering something broken, replace it with the
 * closest inline equivalent.
 */
export function leafBlockAlternatives(doc: Node): void {
  const finder = (node: Node, isInsideLeafBlock: boolean, isInsideInline: boolean): void => {
    const name = nodeName(node);

    const structure = getMarkdownStructure(name);
    if (
      (structure === "container_block" || structure === "leaf_block") &&
      (isInsideLeafBlock || isInsideInline)
    ) {
      // For example, you cannot place a blockquote inside a heading.
      //
      // Instead of this weird output (## Heading > My Quote)
      // we try to find alternatives (## Heading "My Quote")
      const fn = alternatives[name];
      if (fn !== undefined) {
        fn(node);
      } else {
        node.data = "span";
      }
    }

    if (structure === "leaf_block") {
      isInsideLeafBlock = true;
    }
    if (structure === "inline") {
      isInsideInline = true;
    }

    // The Go version registers the recursion with `defer`, which makes the
    // children run in reverse order after the current node is done. Snapshot
    // and reverse to keep the same traversal.
    const children = allChildNodes(node);
    for (let i = children.length - 1; i >= 0; i--) {
      finder(children[i]!, isInsideLeafBlock, isInsideInline);
    }
  };

  finder(doc, false, false);
}
