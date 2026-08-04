import type { Node } from "../dom/node.js";
import { allChildNodes } from "../dom/helpers.js";
import type { Context, TagType, Writer } from "./types.js";
import type { Converter } from "./converter.js";

/** State that lives for the duration of one conversion run. */
export class GlobalState {
  private data = new Map<string, unknown>();

  get<V>(key: string): V | undefined {
    return this.data.get(key) as V | undefined;
  }

  set<V>(key: string, val: V): void {
    this.data.set(key, val);
  }

  update<V>(key: string, fn: (val: V | undefined) => V): void {
    this.data.set(key, fn(this.data.get(key) as V | undefined));
  }
}

export class ConverterContext implements Context {
  constructor(
    private readonly conv: Converter,
    private readonly state: GlobalState,
    private readonly baseDomain: string,
    private readonly values: ReadonlyMap<string, unknown> = new Map(),
  ) {}

  value(key: string): unknown {
    return this.values.get(key);
  }

  withValue(key: string, val: unknown): Context {
    const next = new Map(this.values);
    next.set(key, val);
    return new ConverterContext(this.conv, this.state, this.baseDomain, next);
  }

  domain(): string {
    return this.baseDomain;
  }

  assembleAbsoluteURL(tagName: string, rawURL: string): string {
    return this.conv.assembleAbsoluteURL(tagName, rawURL, this.baseDomain);
  }

  getTagType(tagName: string): TagType | undefined {
    return this.conv.getTagType(tagName);
  }

  renderNodes(w: Writer, ...nodes: Node[]): void {
    for (const node of nodes) {
      this.conv.renderNode(this, w, node);
    }
  }

  renderChildNodes(w: Writer, n: Node): void {
    this.renderNodes(w, ...allChildNodes(n));
  }

  escapeContent(content: string): string {
    return this.conv.escapeContent(content);
  }

  unEscapeContent(content: string): string {
    return this.conv.unEscapeContent(content);
  }

  getState<V>(key: string): V | undefined {
    return this.state.get<V>(key);
  }

  setState<V>(key: string, val: V): void {
    this.state.set(key, val);
  }

  updateState<V>(key: string, fn: (val: V | undefined) => V): void {
    this.state.update(key, fn);
  }
}
