import { Node, NodeType } from "../../dom/node.js";
import {
  allChildNodes,
  getAttributeOr,
  nodeName,
} from "../../dom/helpers.js";
import { render as renderHTML } from "../../dom/serialize.js";
import {
  LIST_END_COMMENT_DATA,
  addListEndComments,
  addSpace,
  collectTagNames,
  leafBlockAlternatives,
  mergeAdjacent,
  moveListItems,
  removeEmptyCode,
  removeRedundant,
  renameFakeSpans,
  swapTags,
} from "../../internal/domutils.js";
import {
  calculateCodeFence,
  calculateCodeFenceOccurrences,
  collapseInlineCodeContent,
  delimiterForEveryLine,
  escapeMultiLine,
  indentMultiLineListItem,
  prefixLines,
  surroundByQuotes,
  surroundingSpaces,
  trimConsecutiveNewlines,
  trimUnnecessaryHardLineBreaks,
} from "../../internal/textutils.js";
import { MARKER_CODE_BLOCK_NEWLINE, MARKER_ESCAPING } from "../../internal/marker.js";
import { trimSpace } from "../../internal/unicode.js";
import {
  isAtxHeader,
  isBackslash,
  isBlockQuote,
  isDivider,
  isFencedCode,
  isImageOrLink,
  isInlineCode,
  isItalicOrBold,
  isOrderedList,
  isSetextHeader,
  isUnorderedList,
} from "../../internal/escape.js";
import {
  PriorityLate,
  PriorityStandard,
  RenderStatus,
  StringWriter,
  type Context,
  type Plugin,
  type RegisterTarget,
  type Writer,
} from "../../converter/types.js";
import {
  fillInDefaultConfig,
  validateConfig,
  type CommonmarkOptions,
  type Config,
} from "./options.js";

export * from "./options.js";

// - - - - - - - - - - - - - Node predicates - - - - - - - - - - - - - //

const nameIsBold = (node: Node): boolean => {
  const name = nodeName(node);
  return name === "strong" || name === "b";
};

const nameIsItalic = (node: Node): boolean => {
  const name = nodeName(node);
  return name === "em" || name === "i";
};

const nameIsBoldOrItalic = (node: Node): boolean => nameIsBold(node) || nameIsItalic(node);

const nameIsBothBoldOrItalic = (a: Node, b: Node): boolean =>
  (nameIsBold(a) && nameIsBold(b)) || (nameIsItalic(a) && nameIsItalic(b));

const nameIsPre = (node: Node): boolean => nodeName(node) === "pre";

const nameIsInlineCode = (node: Node): boolean => {
  const name = nodeName(node);
  return name === "code" || name === "var" || name === "samp" || name === "kbd" || name === "tt";
};

const nameIsLink = (node: Node): boolean => nodeName(node) === "a";
const nameIsBothLink = (a: Node, b: Node): boolean => nameIsLink(a) && nameIsLink(b);

const nameIsHeading = (node: Node): boolean => {
  const name = nodeName(node);
  return name === "h1" || name === "h2" || name === "h3" || name === "h4" || name === "h5" || name === "h6";
};

// - - - - - - - - - - - - - The plugin - - - - - - - - - - - - - //

class CommonmarkPlugin implements Plugin {
  private readonly config: Config;

  constructor(options: CommonmarkOptions) {
    this.config = fillInDefaultConfig(options);
  }

  name(): string {
    return "commonmark";
  }

  init(conv: RegisterTarget): void {
    validateConfig(this.config);

    conv.register.preRenderer((_ctx, doc) => this.handlePreRender(doc), PriorityStandard);

    // Should run after "collapse" and after "remove".
    conv.register.preRenderer((_ctx, doc) => {
      if (this.config.disableListEndComment) {
        return;
      }
      addListEndComments(doc);
    }, PriorityLate + 100);

    conv.register.escapedChar(
      "\\",
      "*", "_", "-", "+",
      ".", ">", "|",
      "$",
      "#", "=",
      "[", "]", "(", ")",
      "!",
      "~", "`", '"', "'",
    );

    for (const fn of [
      isItalicOrBold,
      isBlockQuote,
      isAtxHeader,
      isSetextHeader,
      isDivider,
      isOrderedList,
      isUnorderedList,
      isImageOrLink,
      isFencedCode,
      isInlineCode,
      isBackslash,
    ]) {
      conv.register.unEscaper(fn, PriorityStandard);
    }

    conv.register.renderer((ctx, w, n) => this.handleRender(ctx, w, n), PriorityStandard);
    conv.register.textTransformer(handleTextTransform, PriorityLate);
    conv.register.postRenderer(handlePostRenderCodeBlockNewline, PriorityLate);
  }

  private handlePreRender(doc: Node): void {
    renameFakeSpans(doc);

    // Each transform below walks the entire document, so a page with no links
    // still paid for three passes hunting for them. Collect the tag names once
    // and skip the passes that cannot match.
    //
    // This stays accurate because nothing between here and leafBlockAlternatives
    // introduces a tag name: the removals and merges only take nodes away, and
    // swapTags exchanges names between two elements that are both already
    // present. A tag that is removed leaves a stale entry, which only costs a
    // pass that finds nothing.
    const tags = collectTagNames(doc);
    const hasAny = (...names: string[]): boolean => names.some((name) => tags.has(name));

    const hasBoldOrItalic = hasAny("strong", "b", "em", "i");
    const hasInlineCode = hasAny("code", "var", "samp", "kbd", "tt");
    const hasLink = tags.has("a");

    // - - - Bold / Italic - - - //
    if (hasBoldOrItalic) {
      removeRedundant(doc, nameIsBothBoldOrItalic);
      mergeAdjacent(doc, nameIsBoldOrItalic);
    }

    // - - - Code - - - //
    if (tags.has("code")) {
      removeEmptyCode(doc);
    }
    if (hasInlineCode) {
      if (tags.has("pre")) {
        swapTags(doc, nameIsInlineCode, nameIsPre);
      }
      mergeAdjacent(doc, nameIsInlineCode);
    }

    if (hasBoldOrItalic && hasInlineCode) {
      addSpace(doc, nameIsBoldOrItalic, nameIsInlineCode);
    }

    // - - - Link - - - //
    if (hasLink) {
      removeRedundant(doc, nameIsBothLink);
      if (hasBoldOrItalic) {
        swapTags(doc, nameIsBoldOrItalic, nameIsLink);
      }

      // - - - Heading - - - //
      if (hasAny("h1", "h2", "h3", "h4", "h5", "h6")) {
        swapTags(doc, nameIsLink, nameIsHeading);
      }
    }

    leafBlockAlternatives(doc);

    // - - - List - - - //
    // Safe to key on the set collected above: the alternatives above only
    // rename to strong, span, br and code, so neither list container can
    // appear after it was taken.
    if (hasAny("ul", "ol")) {
      moveListItems(doc);
    }
  }

  private handleRender(ctx: Context, w: Writer, n: Node): RenderStatus {
    switch (nodeName(n)) {
      case "strong":
      case "b":
      case "em":
      case "i":
        return this.renderBoldItalic(ctx, w, n);
      case "hr":
        return this.renderDivider(w);
      case "br":
        return renderBreak(w);
      case "ul":
      case "ol":
        return this.renderListContainer(ctx, w, n);
      case "pre":
        return this.renderBlockCode(w, n);
      case "code":
      case "var":
      case "samp":
      case "kbd":
      case "tt":
        return renderInlineCode(w, n);
      case "blockquote":
        return renderBlockquote(ctx, w, n);
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return this.renderHeading(ctx, w, n);
      case "img":
        return renderImage(ctx, w, n);
      case "a":
        return this.renderLink(ctx, w, n);
      case "#comment":
        return renderComment(w, n);
      default:
        return RenderStatus.TryNext;
    }
  }

  // - - - - - - - - - - - - - Bold / Italic - - - - - - - - - - - - - //

  private getDelimiter(n: Node): string {
    const name = nodeName(n);
    if (name === "strong" || name === "b") {
      return this.config.strongDelimiter;
    }
    if (name === "em" || name === "i") {
      return this.config.emDelimiter;
    }
    return "";
  }

  private renderBoldItalic(ctx: Context, w: Writer, n: Node): RenderStatus {
    const buf = new StringWriter();
    ctx.renderChildNodes(buf, n);

    // If there is a newline character between the start and end delimiter the
    // delimiters won't be recognized, so put them on every line instead.
    w.write(delimiterForEveryLine(buf.toString(), this.getDelimiter(n)));

    return RenderStatus.Success;
  }

  // - - - - - - - - - - - - - Divider - - - - - - - - - - - - - //

  private renderDivider(w: Writer): RenderStatus {
    w.write("\n\n");
    w.write(this.config.horizontalRule);
    w.write("\n\n");
    return RenderStatus.Success;
  }

  // - - - - - - - - - - - - - Code block - - - - - - - - - - - - - //

  private renderBlockCode(w: Writer, n: Node): RenderStatus {
    let [code, infoString] = getCodeWithoutTags(n);

    if (code.endsWith("\n")) {
      code = code.slice(0, -1);
    }

    const fenceChar = this.config.codeBlockFence[0]!;
    const fence = calculateCodeFence(fenceChar, code);

    // We want to keep the original content inside the code block untouched.
    // Because multiple newlines would be trimmed, temporarily replace them.
    code = code.replaceAll("\n", MARKER_CODE_BLOCK_NEWLINE);

    w.write("\n\n");
    w.write(fence);
    w.write(infoString);
    w.write("\n");
    w.write(code);
    w.write("\n");
    w.write(fence);
    w.write("\n\n");

    return RenderStatus.Success;
  }

  // - - - - - - - - - - - - - Heading - - - - - - - - - - - - - //

  private renderHeading(ctx: Context, w: Writer, n: Node): RenderStatus {
    const level = getHeadingLevel(nodeName(n));

    const buf = new StringWriter();
    ctx.renderChildNodes(buf, n);
    let content = buf.toString();

    if (trimSpace(content).length === 0) {
      return RenderStatus.Success;
    }

    if (this.config.headingStyle === "setext" && level < 3) {
      // Note: `trimUnnecessaryHardLineBreaks` is not used here, since
      // `escapeMultiLine` also takes care of newlines.
      content = trimConsecutiveNewlines(content);
      content = escapeMultiLine(content);

      const width = getUnderlineWidth(content, 3);
      const underline = (level === 1 ? "=" : "-").repeat(width);

      w.write("\n\n");
      w.write(content);
      w.write("\n");
      w.write(underline);
      w.write("\n\n");
    } else {
      content = content.replaceAll("\n", " ").replaceAll("\r", " ");
      // Replace multiple spaces by one space.
      content = content.replace(/ {2,}/g, " ");
      content = trimSpace(content);

      // A "#" sign at the end would be removed otherwise
      content = escapePoundSignAtEnd(content);

      w.write("\n\n");
      w.write("#".repeat(level));
      w.write(" ");
      w.write(content);
      w.write("\n\n");
    }

    return RenderStatus.Success;
  }

  // - - - - - - - - - - - - - Link - - - - - - - - - - - - - //

  private renderLink(ctx: Context, w: Writer, n: Node): RenderStatus {
    const linkCtx = ctx.withValue("is_inside_link", true);

    let href = getAttributeOr(n, "href", "").trim();
    href = linkCtx.assembleAbsoluteURL("a", href);

    if (href === "" && this.config.linkEmptyHrefBehavior === "skip") {
      // There is *no href* for the link. Either keep rendering it as a link
      // or skip, letting other renderers take over.
      return RenderStatus.TryNext;
    }

    let title = getAttributeOr(n, "title", "").replaceAll("\n", " ");

    const buf = new StringWriter();
    linkCtx.renderChildNodes(buf, n);
    const content = buf.toString();

    if (trimSpace(content).length === 0 && this.config.linkEmptyContentBehavior === "skip") {
      // There is *no content* inside the link.
      return RenderStatus.TryNext;
    }

    if (href === "") {
      // A link without href is valid, like e.g. [text]()
      // But a title would make it invalid.
      title = "";
    }

    const [leftExtra, rawTrimmed, rightExtra] = surroundingSpaces(content);

    // Note: `trimUnnecessaryHardLineBreaks` is not used here, since
    // `escapeMultiLine` also takes care of newlines.
    let trimmed = trimConsecutiveNewlines(rawTrimmed);
    trimmed = escapeMultiLine(trimmed);

    if (this.config.linkStyle !== "inlined") {
      return RenderStatus.TryNext;
    }

    w.write(leftExtra);
    w.write("[");
    w.write(trimmed);
    w.write("]");
    w.write("(");
    w.write(href);
    if (title !== "") {
      // The destination and title must be separated by a space
      w.write(" ");
      w.write(surroundByQuotes(title));
    }
    w.write(")");
    w.write(rightExtra);

    return RenderStatus.Success;
  }

  // - - - - - - - - - - - - - List - - - - - - - - - - - - - //

  private getPrefixFn(n: Node, sliceLength: number): (index: number) => string {
    const startAt = getStartAt(n);

    return (sliceIndex: number): string => {
      if (n.data === "ul") {
        return this.config.bulletListMarker + " ";
      }

      const currentIndex = startAt + sliceIndex;
      const lastIndex = startAt + sliceLength - 1;
      const maxLength = String(lastIndex).length;

      // Pad the numbers so that all prefixes in the list take up the same
      // space, e.g. "01. " and "10. ".
      return String(currentIndex).padStart(maxLength, "0") + ". ";
    };
  }

  private renderListContainer(ctx: Context, w: Writer, n: Node): RenderStatus {
    const items: string[] = [];

    for (const child of allChildNodes(n)) {
      const buf = new StringWriter();
      ctx.renderNodes(buf, child);

      const content = trimSpace(buf.toString());
      if (content === "") {
        continue;
      }
      items.push(content);
    }

    if (items.length === 0) {
      return RenderStatus.Success;
    }

    const getPrefix = this.getPrefixFn(n, items.length);
    const indentCount = [...getPrefix(0)].length;

    w.write("\n\n");
    for (let i = 0; i < items.length; i++) {
      w.write(getPrefix(i));

      let item = trimConsecutiveNewlines(items[i]!);
      item = trimUnnecessaryHardLineBreaks(item);
      item = ctx.unEscapeContent(item);

      // An item might have different lines that each must be indented with
      // the correct count of spaces.
      w.write(indentMultiLineListItem(item, indentCount));

      if (i < items.length - 1) {
        w.write("\n");
      }
    }
    w.write("\n\n");

    return RenderStatus.Success;
  }
}

/** Registers the markdown syntax of commonmark. */
export function newCommonmarkPlugin(options: CommonmarkOptions = {}): Plugin {
  return new CommonmarkPlugin(options);
}

// - - - - - - - - - - - - - Standalone renderers - - - - - - - - - - - - - //

function renderBreak(w: Writer): RenderStatus {
  // Render a "hard line break"
  w.write("  \n");
  return RenderStatus.Success;
}

function renderBlockquote(ctx: Context, w: Writer, n: Node): RenderStatus {
  const buf = new StringWriter();
  ctx.renderChildNodes(buf, n);

  let content = trimSpace(buf.toString());
  if (content === "") {
    return RenderStatus.Success;
  }

  content = trimConsecutiveNewlines(content);
  content = trimUnnecessaryHardLineBreaks(content);
  content = prefixLines(content, "> ");

  w.write("\n\n");
  w.write(content);
  w.write("\n\n");

  return RenderStatus.Success;
}

function renderComment(w: Writer, n: Node): RenderStatus {
  if (n.data === LIST_END_COMMENT_DATA) {
    // We definitely want to render the list end comments that were just added
    w.write("\n\n");
    w.write(renderHTML(n));
    w.write("\n\n");
    return RenderStatus.Success;
  }

  // Fallback to the normal settings for comments
  return RenderStatus.TryNext;
}

function renderInlineCode(w: Writer, n: Node): RenderStatus {
  const fenceChar = "`";
  const [codeContent] = getCodeWithoutTags(n);

  if (trimSpace(codeContent) === "") {
    // No stripping occurs if the code span contains _only_ spaces
    w.write(fenceChar);
    w.write(codeContent);
    w.write(fenceChar);
    return RenderStatus.Success;
  }

  // Newlines aren't great, since this is inline code and not a code block.
  // They are stripped in the browser anyway, but more than one newline would
  // stop a markdown parser from recognizing this as code.
  let code = collapseInlineCodeContent(codeContent);

  const fence = fenceChar.repeat(calculateCodeFenceOccurrences(fenceChar, code) + 1);

  // Code contains a backtick as first character
  if (code.startsWith("`")) {
    code = " " + code;
  }
  // Code contains a backtick as last character
  if (code.endsWith("`")) {
    code = code + " ";
  }

  w.write(fence);
  w.write(code);
  w.write(fence);

  return RenderStatus.Success;
}

function escapeAlt(alt: string): string {
  let out = "";
  for (let i = 0; i < alt.length; i++) {
    const char = alt[i]!;
    if (char === "[" || char === "]") {
      if (i === 0 || alt[i - 1] !== "\\") {
        out += "\\";
      }
    }
    out += char;
  }
  return out;
}

function renderImage(ctx: Context, w: Writer, n: Node): RenderStatus {
  let src = getAttributeOr(n, "src", "").trim();
  if (src === "") {
    return RenderStatus.TryNext;
  }

  src = ctx.assembleAbsoluteURL("img", src);

  const title = getAttributeOr(n, "title", "").replaceAll("\n", " ");
  const alt = getAttributeOr(n, "alt", "").replaceAll("\n", " ");

  w.write("!");
  w.write("[");
  // The alt description is placed between square brackets, so make sure
  // those characters are escaped.
  w.write(escapeAlt(alt));
  w.write("]");
  w.write("(");
  w.write(src);
  if (title !== "") {
    // The destination and title must be separated by a space
    w.write(" ");
    w.write(surroundByQuotes(title));
  }
  w.write(")");

  return RenderStatus.Success;
}

// - - - - - - - - - - - - - Helpers - - - - - - - - - - - - - //

function handleTextTransform(ctx: Context, content: string): string {
  if (ctx.value("is_inside_link") === true) {
    return content.replaceAll(MARKER_ESCAPING + "]", "\\]");
  }
  return content;
}

function handlePostRenderCodeBlockNewline(_ctx: Context, content: string): string {
  return content.replaceAll(MARKER_CODE_BLOCK_NEWLINE, "\n");
}

function getHeadingLevel(name: string): number {
  switch (name) {
    case "h1": return 1;
    case "h2": return 2;
    case "h3": return 3;
    case "h4": return 4;
    case "h5": return 5;
    case "h6": return 6;
    default: return 6;
  }
}

/** Counts code points, ignoring the internal escaping marker. */
function markerlessLength(s: string): number {
  let count = 0;
  for (const char of s) {
    if (char === MARKER_ESCAPING) {
      continue;
    }
    count++;
  }
  return count;
}

function getUnderlineWidth(content: string, minVal: number): number {
  let width = 0;
  for (const part of content.split("\n")) {
    const w = markerlessLength(part);
    if (w > width) {
      width = w;
    }
  }

  // Technically the minimum is one character, but a single dash could easily
  // trigger a heading.
  return width < minVal ? minVal : width;
}

/**
 * A "#" at the very end of a heading would be swallowed by the parser, so
 * force the escaping by turning its placeholder into a backslash.
 */
function escapePoundSignAtEnd(s: string): string {
  if (!s.endsWith("#")) {
    // We don't have a "#" at the end, so there is no work to do.
    return s;
  }
  if (s.length >= 3 && s[s.length - 3] === "\\") {
    // It is already escaped.
    return s;
  }
  if (s.length < 2) {
    return s;
  }

  // Override the placeholder that sits in front of the "#".
  return s.slice(0, s.length - 2) + "\\" + s[s.length - 1];
}

function getStartAt(node: Node): number {
  const startVal = getAttributeOr(node, "start", "1");
  const startAt = Number.parseInt(startVal, 10);
  if (!Number.isFinite(startAt) || !/^[+-]?\d+$/.test(startVal.trim())) {
    return 1;
  }
  return startAt;
}

function getCodeLanguage(n: Node): string {
  const cls = getAttributeOr(n, "class", "");

  for (let part of cls.split(" ")) {
    if (!part.includes("language-") && !part.includes("lang-")) {
      continue;
    }
    part = part.replace("language-", "").replace("lang-", "");
    return part;
  }

  return "";
}

/** Collects the raw text of a code block, plus the info string (language). */
function getCodeWithoutTags(startNode: Node): [string, string] {
  const parts: string[] = [];
  let infoString = "";

  const walk = (n: Node): void => {
    if (n.type === NodeType.Element && (n.data === "code" || n.data === "pre")) {
      if (infoString === "") {
        infoString = getCodeLanguage(n);
      }
    }

    if (n.type === NodeType.Element && (n.data === "style" || n.data === "script" || n.data === "textarea")) {
      return;
    }
    if (n.type === NodeType.Element && (n.data === "br" || n.data === "div")) {
      parts.push("\n");
    }

    if (n.type === NodeType.Text) {
      parts.push(n.data);
      return;
    }

    for (let c = n.firstChild; c !== null; c = c.nextSibling) {
      walk(c);
    }
  };

  walk(startNode);

  return [parts.join(""), infoString];
}
