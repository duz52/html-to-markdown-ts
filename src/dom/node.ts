/**
 * A DOM node modelled after `html.Node` from Go's "golang.org/x/net/html".
 *
 * The upstream Go library walks and mutates the tree through the
 * parent / firstChild / nextSibling linked-list pointers rather than through
 * child arrays. Keeping that exact shape here means the traversal and
 * mutation logic can be ported directly instead of being rewritten, which is
 * the main reason the output matches.
 */

export enum NodeType {
  Error = 0,
  Text = 1,
  Document = 2,
  Element = 3,
  Comment = 4,
  Doctype = 5,
}

/**
 * The attribute list handed to every node parsed without attributes.
 *
 * Most elements in a document have no attributes at all, and giving each of
 * them its own array is enough allocation to push the nodes apart on the heap.
 * They share this one instead.
 *
 * It is frozen because it is shared: code that needs to add an attribute has to
 * put a fresh array on the node first (see the tree adapter), and anything that
 * writes here by mistake fails immediately rather than silently altering every
 * other attribute-less node.
 */
export const EMPTY_ATTRS: Attribute[] = Object.freeze([] as Attribute[]) as Attribute[];

export interface Attribute {
  namespace?: string;
  key: string;
  val: string;
}

export class Node {
  parent: Node | null = null;
  firstChild: Node | null = null;
  lastChild: Node | null = null;
  prevSibling: Node | null = null;
  nextSibling: Node | null = null;

  type: NodeType;
  /** Tag name for elements, text content for text nodes, comment body for comments. */
  data: string;
  namespace: string;
  attr: Attribute[];

  constructor(init: {
    type: NodeType;
    data?: string;
    namespace?: string;
    attr?: Attribute[];
  }) {
    this.type = init.type;
    this.data = init.data ?? "";
    this.namespace = init.namespace ?? "";
    this.attr = init.attr ?? [];
  }

  /**
   * Inserts newChild as a child of this node, immediately before oldChild.
   * If oldChild is null, newChild is appended to the end of the child list.
   */
  insertBefore(newChild: Node, oldChild: Node | null): void {
    if (newChild.parent !== null || newChild.prevSibling !== null || newChild.nextSibling !== null) {
      throw new Error("html: insertBefore called for an attached child Node");
    }

    let prev: Node | null = null;
    let next: Node | null = null;

    if (oldChild !== null) {
      if (oldChild.parent !== this) {
        throw new Error("html: insertBefore called for a non-child Node");
      }
      prev = oldChild.prevSibling;
      next = oldChild;
    } else {
      prev = this.lastChild;
    }

    if (prev !== null) {
      prev.nextSibling = newChild;
    } else {
      this.firstChild = newChild;
    }

    if (next !== null) {
      next.prevSibling = newChild;
    } else {
      this.lastChild = newChild;
    }

    newChild.parent = this;
    newChild.prevSibling = prev;
    newChild.nextSibling = next;
  }

  appendChild(c: Node): void {
    if (c.parent !== null || c.prevSibling !== null || c.nextSibling !== null) {
      throw new Error("html: appendChild called for an attached child Node");
    }

    const last = this.lastChild;
    if (last !== null) {
      last.nextSibling = c;
    } else {
      this.firstChild = c;
    }
    this.lastChild = c;
    c.parent = this;
    c.prevSibling = last;
  }

  removeChild(c: Node): void {
    if (c.parent !== this) {
      throw new Error("html: removeChild called for a non-child Node");
    }

    if (this.firstChild === c) {
      this.firstChild = c.nextSibling;
    }
    if (c.nextSibling !== null) {
      c.nextSibling.prevSibling = c.prevSibling;
    }
    if (this.lastChild === c) {
      this.lastChild = c.prevSibling;
    }
    if (c.prevSibling !== null) {
      c.prevSibling.nextSibling = c.nextSibling;
    }

    c.parent = null;
    c.prevSibling = null;
    c.nextSibling = null;
  }
}

export function newElement(tagName: string, attr: Attribute[] = []): Node {
  return new Node({ type: NodeType.Element, data: tagName, attr });
}

export function newText(text: string): Node {
  return new Node({ type: NodeType.Text, data: text });
}

export function newComment(text: string): Node {
  return new Node({ type: NodeType.Comment, data: text });
}
