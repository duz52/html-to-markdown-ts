import type { Node } from "../dom/node.js";

/** The result of a render handler. */
export enum RenderStatus {
  /** This handler did not render the node; try the next one. */
  TryNext = 0,
  /** This handler rendered the node. */
  Success = 1,
}

/**
 * How a tag participates in the markdown block structure.
 */
export type TagType = "block" | "inline" | "remove";

export const TagTypeBlock: TagType = "block";
export const TagTypeInline: TagType = "inline";
/** Removes the node in the pre-render phase with a high priority. */
export const TagTypeRemove: TagType = "remove";

export const PriorityEarly = 100;
export const PriorityStandard = 500;
export const PriorityLate = 1000;

/** Collects the rendered markdown. */
export interface Writer {
  write(s: string): void;
}

export class StringWriter implements Writer {
  private parts: string[] = [];

  write(s: string): void {
    if (s !== "") {
      this.parts.push(s);
    }
  }

  toString(): string {
    return this.parts.join("");
  }
}

export type PreRenderFn = (ctx: Context, doc: Node) => void;
export type RenderFn = (ctx: Context, w: Writer, n: Node) => RenderStatus;
export type PostRenderFn = (ctx: Context, content: string) => string;
export type TextTransformFn = (ctx: Context, content: string) => string;
export type UnEscapeFn = (chars: string, index: number) => number;
export type AssembleAbsoluteURLFn = (tagName: string, rawURL: string, domain: string) => string;

/**
 * The context that is threaded through every handler. It carries per-run
 * values and gives handlers access to the converter itself.
 */
export interface Context {
  /** Reads an arbitrary value that was attached with {@link withValue}. */
  value(key: string): unknown;
  /** Returns a copy of the context with an extra value attached. */
  withValue(key: string, val: unknown): Context;

  /** The base domain given via `withDomain`, or "". */
  domain(): string;
  assembleAbsoluteURL(tagName: string, rawURL: string): string;

  getTagType(tagName: string): TagType | undefined;

  renderNodes(w: Writer, ...nodes: Node[]): void;
  renderChildNodes(w: Writer, n: Node): void;

  escapeContent(content: string): string;
  unEscapeContent(content: string): string;

  /** Mutable state shared across the whole conversion run. */
  getState<V>(key: string): V | undefined;
  setState<V>(key: string, val: V): void;
  updateState<V>(key: string, fn: (val: V | undefined) => V): void;
}

/** Extends the converter beyond what commonmark offers. */
export interface Plugin {
  /** The public name of the plugin, e.g. "strikethrough". */
  name(): string;
  /** Called to initialize the plugin: validate options and register rules. */
  init(conv: RegisterTarget): void;
}

/**
 * The subset of the converter a plugin needs during {@link Plugin.init}.
 */
export interface RegisterTarget {
  register: Register;
}

export interface Register {
  plugin(plugin: Plugin): void;

  preRenderer(fn: PreRenderFn, priority: number): void;
  renderer(fn: RenderFn, priority: number): void;
  rendererFor(tagName: string, tagType: TagType, fn: RenderFn, priority: number): void;
  postRenderer(fn: PostRenderFn, priority: number): void;
  textTransformer(fn: TextTransformFn, priority: number): void;

  escapedChar(...chars: string[]): void;
  unEscaper(fn: UnEscapeFn, priority: number): void;

  tagType(tagName: string, tagType: TagType, priority: number): void;
}
