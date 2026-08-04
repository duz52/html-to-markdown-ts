/**
 * A parse5 tree adapter that builds the Go-shaped {@link Node} tree directly.
 *
 * parse5 can drive any tree representation through this interface, so the
 * parser writes our nodes as it goes instead of building its own tree that we
 * then walk and copy. That removes a whole intermediate document from memory
 * (the two trees used to be resident at the same time) along with the
 * recursion that copied it.
 *
 * Two places deliberately differ from parse5's default adapter, both to match
 * "golang.org/x/net/html":
 *
 *   - Template contents are ordinary children. The DOM spec puts them in a
 *     separate fragment, and parse5's default adapter follows the spec, but Go
 *     has no such fragment. Returning the template element itself from
 *     getTemplateContent makes the parser append straight into it.
 *   - An element in the XHTML namespace records an empty namespace string,
 *     which is what Go stores.
 */

import type { TreeAdapter, TreeAdapterTypeMap, Token } from "parse5";
import { html as p5html } from "parse5";
import { Node, NodeType, EMPTY_ATTRS, type Attribute } from "./node.js";

type P5Attribute = Token.Attribute;

const { NS, DOCUMENT_MODE } = p5html;

type DocumentMode = (typeof DOCUMENT_MODE)[keyof typeof DOCUMENT_MODE];

/** Every node role maps onto the single {@link Node} class. */
export type GoTreeAdapterMap = TreeAdapterTypeMap<
  Node, // node
  Node, // parentNode
  Node, // childNode
  Node, // document
  Node, // documentFragment
  Node, // element
  Node, // commentNode
  Node, // textNode
  Node, // template
  Node // documentType
>;

// The document mode drives a couple of parser decisions (quirks mode changes
// how <p> is closed inside a table). Go's Node has no field for it, so it is
// kept beside the tree rather than on it.
const documentModes = new WeakMap<Node, DocumentMode>();

// Doctype ids are not part of Go's Node either, which only keeps the name.
const doctypeIds = new WeakMap<Node, { publicId: string; systemId: string }>();

function toGoAttrs(attrs: P5Attribute[]): Attribute[] {
  // Most elements carry no attributes at all, and allocating an array for each
  // of them is what separates one node from the next on the heap.
  if (attrs.length === 0) {
    return EMPTY_ATTRS;
  }
  return attrs.map((a) => {
    const attr: Attribute = { key: a.name, val: a.value };
    if (a.namespace) {
      attr.namespace = a.namespace;
    }
    return attr;
  });
}

function toP5Attrs(attrs: Attribute[]): P5Attribute[] {
  return attrs.map((a) => {
    const attr: P5Attribute = { name: a.key, value: a.val };
    if (a.namespace) {
      attr.namespace = a.namespace;
    }
    return attr;
  });
}

export const goTreeAdapter: TreeAdapter<GoTreeAdapterMap> = {
  // - - - - - - - - - - - - - Construction - - - - - - - - - - - - - //

  createDocument(): Node {
    const doc = new Node({ type: NodeType.Document, attr: EMPTY_ATTRS });
    documentModes.set(doc, DOCUMENT_MODE.NO_QUIRKS);
    return doc;
  },

  createDocumentFragment(): Node {
    // Go's parser has no fragment node type; parseFragment already returned a
    // document-typed root before this adapter existed.
    return new Node({ type: NodeType.Document, attr: EMPTY_ATTRS });
  },

  createElement(tagName: string, namespaceURI: string, attrs: P5Attribute[]): Node {
    // parse5 has already lowercased HTML tag names, as Go does.
    return new Node({
      type: NodeType.Element,
      data: tagName,
      namespace: namespaceURI === NS.HTML ? "" : namespaceURI,
      attr: toGoAttrs(attrs),
    });
  },

  createCommentNode(data: string): Node {
    return new Node({ type: NodeType.Comment, data, attr: EMPTY_ATTRS });
  },

  createTextNode(value: string): Node {
    return new Node({ type: NodeType.Text, data: value, attr: EMPTY_ATTRS });
  },

  // - - - - - - - - - - - - - Tree mutation - - - - - - - - - - - - - //

  appendChild(parentNode: Node, newNode: Node): void {
    parentNode.appendChild(newNode);
  },

  insertBefore(parentNode: Node, newNode: Node, referenceNode: Node): void {
    parentNode.insertBefore(newNode, referenceNode);
  },

  detachNode(node: Node): void {
    node.parent?.removeChild(node);
  },

  insertText(parentNode: Node, text: string): void {
    // Merge into a trailing text node so that character tokens arriving one at
    // a time still produce a single text node, the way Go accumulates them.
    const last = parentNode.lastChild;
    if (last !== null && last.type === NodeType.Text) {
      last.data += text;
      return;
    }
    parentNode.appendChild(new Node({ type: NodeType.Text, data: text, attr: EMPTY_ATTRS }));
  },

  insertTextBefore(parentNode: Node, text: string, referenceNode: Node): void {
    const prev = referenceNode.prevSibling;
    if (prev !== null && prev.type === NodeType.Text) {
      prev.data += text;
      return;
    }
    parentNode.insertBefore(new Node({ type: NodeType.Text, data: text, attr: EMPTY_ATTRS }), referenceNode);
  },

  adoptAttributes(recipient: Node, attrs: P5Attribute[]): void {
    if (attrs.length === 0) {
      return;
    }
    // Copy on write: nodes without attributes share one array.
    if (recipient.attr === EMPTY_ATTRS) {
      recipient.attr = [];
    }
    const present = new Set(recipient.attr.map((a) => a.key));
    for (const attr of attrs) {
      if (!present.has(attr.name)) {
        recipient.attr.push({ key: attr.name, val: attr.value });
      }
    }
  },

  // - - - - - - - - - - - - - Traversal - - - - - - - - - - - - - //

  getFirstChild(node: Node): Node | null {
    return node.firstChild;
  },

  getChildNodes(node: Node): Node[] {
    // The tree is a linked list, so this materializes a snapshot. parse5 only
    // asks for it when source code location tracking is on, which we never
    // enable, but it has to be correct if it ever is.
    const children: Node[] = [];
    for (let c = node.firstChild; c !== null; c = c.nextSibling) {
      children.push(c);
    }
    return children;
  },

  getParentNode(node: Node): Node | null {
    return node.parent;
  },

  getAttrList(element: Node): P5Attribute[] {
    return toP5Attrs(element.attr);
  },

  // - - - - - - - - - - - - - Node data - - - - - - - - - - - - - //

  getTagName(element: Node): string {
    return element.data;
  },

  getNamespaceURI(element: Node): (typeof NS)[keyof typeof NS] {
    return (element.namespace === "" ? NS.HTML : element.namespace) as (typeof NS)[keyof typeof NS];
  },

  getTextNodeContent(textNode: Node): string {
    return textNode.data;
  },

  getCommentNodeContent(commentNode: Node): string {
    return commentNode.data;
  },

  getDocumentTypeNodeName(doctypeNode: Node): string {
    return doctypeNode.data;
  },

  getDocumentTypeNodePublicId(doctypeNode: Node): string {
    return doctypeIds.get(doctypeNode)?.publicId ?? "";
  },

  getDocumentTypeNodeSystemId(doctypeNode: Node): string {
    return doctypeIds.get(doctypeNode)?.systemId ?? "";
  },

  // - - - - - - - - - - - - - Node types - - - - - - - - - - - - - //

  isTextNode(node: Node): node is Node {
    return node.type === NodeType.Text;
  },

  isCommentNode(node: Node): node is Node {
    return node.type === NodeType.Comment;
  },

  isDocumentTypeNode(node: Node): node is Node {
    return node.type === NodeType.Doctype;
  },

  isElementNode(node: Node): node is Node {
    return node.type === NodeType.Element;
  },

  // - - - - - - - - - - - - - Document metadata - - - - - - - - - - - - - //

  setDocumentType(document: Node, name: string, publicId: string, systemId: string): void {
    let doctype: Node | null = null;
    for (let c = document.firstChild; c !== null; c = c.nextSibling) {
      if (c.type === NodeType.Doctype) {
        doctype = c;
        break;
      }
    }

    if (doctype !== null) {
      doctype.data = name;
      doctypeIds.set(doctype, { publicId, systemId });
      return;
    }

    // Go keeps only the name on the node, e.g. "html" for <!DOCTYPE html>.
    const node = new Node({ type: NodeType.Doctype, data: name, attr: EMPTY_ATTRS });
    doctypeIds.set(node, { publicId, systemId });
    document.appendChild(node);
  },

  setDocumentMode(document: Node, mode: DocumentMode): void {
    documentModes.set(document, mode);
  },

  getDocumentMode(document: Node): DocumentMode {
    return documentModes.get(document) ?? DOCUMENT_MODE.NO_QUIRKS;
  },

  setTemplateContent(_templateElement: Node, _contentElement: Node): void {
    // No-op: getTemplateContent hands back the template itself, so the
    // fragment parse5 created for it is simply left unused.
  },

  getTemplateContent(templateElement: Node): Node {
    // Go appends template children straight onto the template element, so
    // pointing the parser at the element reproduces its tree exactly.
    return templateElement;
  },

  // - - - - - - - - - - - - - Source locations - - - - - - - - - - - - - //

  // Go's Node carries no positions and we never turn on parse5's location
  // tracking, so these stay inert.
  setNodeSourceCodeLocation(): void {},
  updateNodeSourceCodeLocation(): void {},
  getNodeSourceCodeLocation(): undefined {
    return undefined;
  },
};
