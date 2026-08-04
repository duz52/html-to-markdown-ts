/**
 * Convert HTML to Markdown.
 *
 * A TypeScript port of the Go library github.com/JohannesKaufmann/html-to-markdown,
 * using parse5 as the HTML parser.
 *
 * @example
 * ```ts
 * import { convert } from "html-to-markdown-ts";
 *
 * convert("<strong>Bold Text</strong>"); // "**Bold Text**"
 * ```
 */

import { Converter, type ConvertOptions } from "./converter/converter.js";
import { newBasePlugin } from "./plugins/base/index.js";
import { newCommonmarkPlugin } from "./plugins/commonmark/index.js";
import type { CommonmarkOptions } from "./plugins/commonmark/options.js";
import { parse } from "./dom/parse.js";
import type { Node } from "./dom/node.js";

export { Converter } from "./converter/converter.js";
export type {
  ConverterOptions,
  ConvertOptions,
  EscapeMode,
} from "./converter/converter.js";

export {
  RenderStatus,
  StringWriter,
  TagTypeBlock,
  TagTypeInline,
  TagTypeRemove,
  PriorityEarly,
  PriorityStandard,
  PriorityLate,
} from "./converter/types.js";
export type {
  Context,
  Plugin,
  Register,
  RegisterTarget,
  TagType,
  Writer,
  PreRenderFn,
  RenderFn,
  PostRenderFn,
  TextTransformFn,
  UnEscapeFn,
  AssembleAbsoluteURLFn,
} from "./converter/types.js";

export { Node, NodeType, newElement, newText, newComment } from "./dom/node.js";
export type { Attribute } from "./dom/node.js";
export { parse, parseFragment } from "./dom/parse.js";
export { render as renderHTML } from "./dom/serialize.js";
export * as dom from "./dom/helpers.js";

export {
  newBasePlugin,
  renderAsHTML,
  renderAsHTMLWrapper,
  renderAsPlaintextWrapper,
} from "./plugins/base/index.js";
export { newCommonmarkPlugin } from "./plugins/commonmark/index.js";
export type {
  CommonmarkOptions,
  HeadingStyle,
  LinkStyle,
  LinkRenderingBehavior,
} from "./plugins/commonmark/options.js";
export { newStrikethroughPlugin } from "./plugins/strikethrough/index.js";
export type { StrikethroughOptions } from "./plugins/strikethrough/index.js";
export {
  newTablePlugin,
  cellDisplayWidth,
  calculateMaxWidths,
} from "./plugins/table/index.js";
export type {
  TableOptions,
  SpanCellBehavior,
  NewlineBehavior,
  CellPaddingBehavior,
} from "./plugins/table/index.js";

export { stringWidth } from "./internal/width.js";

// - - - - - - - - - - - - - Convenience API - - - - - - - - - - - - - //

export interface ConvertStringOptions extends ConvertOptions {
  /** Options forwarded to the commonmark plugin. */
  commonmark?: CommonmarkOptions;
}

function defaultConverter(commonmark?: CommonmarkOptions): Converter {
  return new Converter({
    plugins: [newBasePlugin(), newCommonmarkPlugin(commonmark)],
  });
}

/**
 * Converts an HTML string to markdown using the base and commonmark plugins.
 *
 * For tables, strikethrough, or custom rules, build a {@link Converter} with
 * the plugins you need instead.
 */
export function convert(html: string, options: ConvertStringOptions = {}): string {
  const { commonmark, ...convertOptions } = options;
  return defaultConverter(commonmark).convertString(html, convertOptions);
}

/**
 * Converts an already parsed document to markdown.
 *
 * Note that the node tree is *mutated* during conversion.
 */
export function convertNode(doc: Node, options: ConvertStringOptions = {}): string {
  const { commonmark, ...convertOptions } = options;
  return defaultConverter(commonmark).convertNode(doc, convertOptions);
}

export { parse as parseHTML };
