/*

The function to collapse whitespace was adapted from the "turndown" library by Dom Christie,
which was adapted from the "collapse-whitespace" library by Luc Thevenard.

It was ported from Javascript to Golang by Johannes Kaufmann for the use in the "html-to-markdown" library,
and ported back to TypeScript here.

https://github.com/wooorm/collapse-white-space
https://github.com/mixmark-io/turndown
https://github.com/JohannesKaufmann/html-to-markdown

-----------

MIT License

Copyright (c) 2017 Dom Christie
Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
Copyright (c) 2018 Johannes Kaufmann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import { Node, NodeType } from "../dom/node.js";
import { nodeName } from "../dom/helpers.js";
import { replaceAnyWhitespaceWithSpace } from "./whitespace.js";
import {
  defaultIsBlockNode,
  defaultIsVoidNode,
  defaultIsPreformattedNode,
} from "./isNode.js";

export interface DomFuncs {
  isBlockNode?: (node: Node) => boolean;
  isVoidNode?: (node: Node) => boolean;
  isPreformattedNode?: (node: Node) => boolean;
}

interface ResolvedDomFuncs {
  isBlockNode: (node: Node) => boolean;
  isVoidNode: (node: Node) => boolean;
  isPreformattedNode: (node: Node) => boolean;
}

function fillDefaultDomFuncs(domFuncs?: DomFuncs): ResolvedDomFuncs {
  return {
    isBlockNode: domFuncs?.isBlockNode ?? defaultIsBlockNode,
    isVoidNode: domFuncs?.isVoidNode ?? defaultIsVoidNode,
    isPreformattedNode: domFuncs?.isPreformattedNode ?? defaultIsPreformattedNode,
  };
}

function nextNode(prev: Node | null, current: Node, domFuncs: ResolvedDomFuncs): Node | null {
  if ((prev !== null && prev.parent === current) || domFuncs.isPreformattedNode(current)) {
    if (current.nextSibling !== null) {
      return current.nextSibling;
    }
    return current.parent;
  }

  if (current.firstChild !== null) {
    return current.firstChild;
  }
  if (current.nextSibling !== null) {
    return current.nextSibling;
  }

  return current.parent;
}

function removeNode(node: Node): Node | null {
  let next = node.nextSibling;
  if (next === null) {
    next = node.parent;
  }

  node.parent?.removeChild(node);

  return next;
}

function trimSuffixSpace(s: string): string {
  return s.endsWith(" ") ? s.slice(0, -1) : s;
}

/**
 * Collapses the whitespace of the element's subtree, the same way a browser
 * would when rendering it.
 */
export function collapse(element: Node, domFuncs?: DomFuncs): void {
  const funcs = fillDefaultDomFuncs(domFuncs);

  if (element.firstChild === null || funcs.isPreformattedNode(element)) {
    return;
  }

  let prevText: Node | null = null;
  let keepLeadingWs = false;

  let prev: Node | null = null;
  let node: Node | null = nextNode(prev, element, funcs);

  while (node !== null && node !== element) {
    if (node.type === NodeType.Text) {
      let text = replaceAnyWhitespaceWithSpace(node.data);

      if (
        (prevText === null || prevText.data.endsWith(" ")) &&
        !keepLeadingWs &&
        text !== "" &&
        text[0] === " "
      ) {
        text = text.slice(1);
      }

      // `text` might be empty at this point.
      if (text === "") {
        node = removeNode(node);
        continue;
      }

      node.data = text;
      prevText = node;
    } else if (node.type === NodeType.Element) {
      const name = nodeName(node);
      if (funcs.isBlockNode(node) || name === "br") {
        if (prevText !== null) {
          prevText.data = trimSuffixSpace(prevText.data);
        }
        prevText = null;
        keepLeadingWs = false;
      } else if (funcs.isVoidNode(node) || funcs.isPreformattedNode(node) || name === "code") {
        // Avoid trimming space around non-block, non-BR void elements and inline PRE.
        prevText = null;
        keepLeadingWs = true;
      } else if (prevText !== null) {
        // Drop protection if set previously.
        keepLeadingWs = false;
      }
    } else if (node.type === NodeType.Comment) {
      // Keep comments as they are.
    } else {
      // E.g. a doctype node
      node = removeNode(node);
      continue;
    }

    const next = nextNode(prev, node, funcs);
    prev = node;
    node = next;
  }

  if (prevText !== null) {
    prevText.data = trimSuffixSpace(prevText.data);
    if (prevText.data === "") {
      removeNode(prevText);
    }
  }
}
