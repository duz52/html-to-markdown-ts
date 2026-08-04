import { Node } from "../../dom/node.js";
import { nameIsBlockNode, nodeName, removeNode } from "../../dom/helpers.js";
import { render as renderHTML } from "../../dom/serialize.js";
import { collapse } from "../../collapse/collapse.js";
import { mergeAdjacentTextNodes } from "../../internal/domutils.js";
import {
  trimConsecutiveNewlines,
  trimUnnecessaryHardLineBreaks,
} from "../../internal/textutils.js";
import { trimSpace } from "../../internal/unicode.js";
import {
  PriorityEarly,
  PriorityLate,
  PriorityStandard,
  RenderStatus,
  TagTypeBlock,
  TagTypeRemove,
  type Context,
  type Plugin,
  type RegisterTarget,
  type Writer,
} from "../../converter/types.js";

const removedTags = [
  "#comment",
  "head",
  "script",
  "style",
  "link",
  "meta",
  "iframe",
  "noscript",
  "input",
  "textarea",
];

class BasePlugin implements Plugin {
  name(): string {
    return "base";
  }

  init(conv: RegisterTarget): void {
    for (const tag of removedTags) {
      conv.register.tagType(tag, TagTypeRemove, PriorityStandard);
    }

    conv.register.preRenderer(preRenderRemove, PriorityEarly);
    // The priority is low, so that collapse runs _after_ all the other functions
    conv.register.preRenderer(preRenderCollapse, PriorityLate);

    conv.register.textTransformer(handleTextTransform, PriorityStandard);

    conv.register.postRenderer(postRenderTrimContent, PriorityStandard);
    conv.register.postRenderer(postRenderUnescapeContent, PriorityStandard + 20);
  }
}

/**
 * Registers behavior that is not specific to commonmark: removing nodes,
 * trimming whitespace, collapsing whitespace, and so on.
 */
export function newBasePlugin(): Plugin {
  return new BasePlugin();
}

function preRenderRemove(ctx: Context, doc: Node): void {
  const finder = (node: Node): void => {
    if (ctx.getTagType(nodeName(node)) === TagTypeRemove) {
      removeNode(node);
      return;
    }

    // Go snapshots the children here because nodes are removed as we go. On a
    // linked list the same thing falls out of walking backwards and reading
    // the previous sibling before the recursion, which may detach the child
    // and clear its pointers — and it saves an array per node, on a tree that
    // gets walked a dozen more times after this.
    for (let child = node.lastChild; child !== null; ) {
      const prev = child.prevSibling;
      finder(child);
      child = prev;
    }
  };
  finder(doc);

  // After removing elements it can happen that two #text nodes end up right
  // next to each other. That would break the collapse, so merge them.
  mergeAdjacentTextNodes(doc);
}

function preRenderCollapse(ctx: Context, doc: Node): void {
  collapse(doc, {
    isBlockNode: (node) => {
      const tagName = nodeName(node);
      const tagType = ctx.getTagType(tagName);
      if (tagType !== undefined) {
        return tagType === TagTypeBlock;
      }
      return nameIsBlockNode(tagName);
    },
  });
}

function handleTextTransform(ctx: Context, content: string): string {
  // We are not using a full HTML escape because we care about fewer
  // characters. Note that "&" is intentionally *not* escaped: in most cases
  // a raw "&" is completely fine.
  // https://github.com/JohannesKaufmann/html-to-markdown/issues/178
  let out = content.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  out = ctx.escapeContent(out);
  return out;
}

function postRenderTrimContent(_ctx: Context, result: string): string {
  // Remove whitespace from the beginning & end
  let out = trimSpace(result);

  // Remove too many newlines
  out = trimConsecutiveNewlines(out);
  out = trimUnnecessaryHardLineBreaks(out);

  return out;
}

function postRenderUnescapeContent(ctx: Context, result: string): string {
  return ctx.unEscapeContent(result);
}

// - - - - - - - - - - - - - Reusable renderers - - - - - - - - - - - - - //

/**
 * Renders the node as HTML. Newlines are inserted depending on the
 * configured tag type, so you can get output like:
 *
 *     A text with <strong>bold</strong> and *italic* text
 */
export function renderAsHTML(ctx: Context, w: Writer, node: Node): RenderStatus {
  const tagType = ctx.getTagType(nodeName(node));

  if (tagType === TagTypeBlock) {
    w.write("\n\n");
  }
  w.write(renderHTML(node));
  if (tagType === TagTypeBlock) {
    w.write("\n\n");
  }

  return RenderStatus.Success;
}

/** Renders the node as HTML, but renders its children as markdown. */
export function renderAsHTMLWrapper(ctx: Context, w: Writer, node: Node): RenderStatus {
  const name = nodeName(node);

  w.write("<");
  w.write(name);
  w.write(">\n\n");

  ctx.renderChildNodes(w, node);

  w.write("\n\n</");
  w.write(name);
  w.write(">");

  return RenderStatus.Success;
}

/** Drops the node itself but keeps its children as markdown. */
export function renderAsPlaintextWrapper(ctx: Context, w: Writer, node: Node): RenderStatus {
  const tagType = ctx.getTagType(nodeName(node));

  if (tagType === TagTypeBlock) {
    w.write("\n\n");
  }
  ctx.renderChildNodes(w, node);
  if (tagType === TagTypeBlock) {
    w.write("\n\n");
  }

  return RenderStatus.Success;
}
