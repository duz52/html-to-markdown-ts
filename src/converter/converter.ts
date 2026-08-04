import { Node, NodeType } from "../dom/node.js";
import { nameIsBlockNode, nameIsInlineNode, nodeName } from "../dom/helpers.js";
import { parse } from "../dom/parse.js";
import { ConverterContext, GlobalState } from "./context.js";
import { escapeContent as doEscape, unEscapeContent as doUnEscape } from "./escape.js";
import { defaultAssembleAbsoluteURL } from "./url.js";
import {
  RenderStatus,
  StringWriter,
  TagTypeBlock,
  TagTypeInline,
  type AssembleAbsoluteURLFn,
  type Context,
  type Plugin,
  type PostRenderFn,
  type PreRenderFn,
  type Register,
  type RenderFn,
  type TagType,
  type TextTransformFn,
  type UnEscapeFn,
  type Writer,
} from "./types.js";

export type EscapeMode = "disabled" | "smart";

export interface ConverterOptions {
  plugins?: Plugin[];
  /**
   * How strict the escaping is.
   *
   * Some characters have a special meaning in markdown. Placing a backslash
   * in front of such a character ("\*") escapes it, so it renders literally.
   *
   * @default "smart"
   */
  escapeMode?: EscapeMode;
}

export interface ConvertOptions {
  /**
   * A base domain used to turn relative URLs (in images and links) into
   * absolute ones.
   */
  domain?: string;
}

interface Prioritized<V> {
  value: V;
  priority: number;
}

function sorted<V>(handlers: Array<Prioritized<V>>): V[] {
  // Array.prototype.sort is stable, so handlers with the same priority keep
  // their registration order.
  return [...handlers].sort((a, b) => a.priority - b.priority).map((h) => h.value);
}

export class Converter {
  private registeredPlugins: string[] = [];

  private preRenderHandlers: Array<Prioritized<PreRenderFn>> = [];
  private renderHandlers: Array<Prioritized<RenderFn>> = [];
  private postRenderHandlers: Array<Prioritized<PostRenderFn>> = [];
  private textTransformHandlers: Array<Prioritized<TextTransformFn>> = [];
  private unEscapeHandlers: Array<Prioritized<UnEscapeFn>> = [];

  private markdownChars = new Set<string>();
  private tagTypes = new Map<string, Array<Prioritized<TagType>>>();

  private escapeMode: EscapeMode;
  private assembleAbsoluteURLFn: AssembleAbsoluteURLFn = defaultAssembleAbsoluteURL;

  /** Errors raised while initializing plugins, surfaced on the first convert. */
  private initError: Error | null = null;

  readonly register: Register;

  constructor(options: ConverterOptions = {}) {
    this.escapeMode = options.escapeMode ?? "smart";
    this.register = this.makeRegister();

    for (const plugin of options.plugins ?? []) {
      this.register.plugin(plugin);
      if (this.initError !== null) {
        break;
      }
    }
  }

  private makeRegister(): Register {
    const conv = this;
    return {
      plugin(plugin: Plugin): void {
        const name = plugin.name();
        if (name === "") {
          conv.setError(new Error("the plugin has no name"));
          return;
        }
        conv.registeredPlugins.push(name);
        try {
          plugin.init(conv);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          conv.setError(new Error(`error while initializing "${name}" plugin: ${message}`));
        }
      },

      preRenderer(fn: PreRenderFn, priority: number): void {
        conv.preRenderHandlers.push({ value: fn, priority });
      },

      renderer(fn: RenderFn, priority: number): void {
        conv.renderHandlers.push({ value: fn, priority });
      },

      rendererFor(tagName: string, tagType: TagType, fn: RenderFn, priority: number): void {
        this.tagType(tagName, tagType, priority);
        this.renderer((ctx, w, n) => {
          if (nodeName(n) === tagName) {
            return fn(ctx, w, n);
          }
          return RenderStatus.TryNext;
        }, priority);
      },

      postRenderer(fn: PostRenderFn, priority: number): void {
        conv.postRenderHandlers.push({ value: fn, priority });
      },

      textTransformer(fn: TextTransformFn, priority: number): void {
        conv.textTransformHandlers.push({ value: fn, priority });
      },

      escapedChar(...chars: string[]): void {
        for (const char of chars) {
          conv.markdownChars.add(char);
        }
      },

      unEscaper(fn: UnEscapeFn, priority: number): void {
        conv.unEscapeHandlers.push({ value: fn, priority });
      },

      tagType(tagName: string, tagType: TagType, priority: number): void {
        const existing = conv.tagTypes.get(tagName);
        if (existing === undefined) {
          conv.tagTypes.set(tagName, [{ value: tagType, priority }]);
        } else {
          existing.push({ value: tagType, priority });
        }
      },
    };
  }

  private setError(err: Error): void {
    if (this.initError === null) {
      this.initError = err;
    }
  }

  // - - - - - - - - - - - - - Lookups - - - - - - - - - - - - - //

  getTagType(tagName: string): TagType | undefined {
    const types = this.tagTypes.get(tagName);
    if (types === undefined || types.length === 0) {
      if (nameIsBlockNode(tagName)) {
        return TagTypeBlock;
      }
      if (nameIsInlineNode(tagName)) {
        return TagTypeInline;
      }
      return undefined;
    }

    return sorted(types)[0];
  }

  assembleAbsoluteURL(tagName: string, rawURL: string, domain: string): string {
    return this.assembleAbsoluteURLFn(tagName, rawURL, domain);
  }

  escapeContent(content: string): string {
    if (this.escapeMode === "disabled") {
      return content;
    }
    return doEscape(content, (char) => this.markdownChars.has(char));
  }

  unEscapeContent(content: string): string {
    if (this.escapeMode === "disabled") {
      return content;
    }
    return doUnEscape(content, sorted(this.unEscapeHandlers));
  }

  // - - - - - - - - - - - - - Rendering - - - - - - - - - - - - - //

  renderNode(ctx: Context, w: Writer, node: Node): RenderStatus {
    // - - A: the #text node - - //
    if (node.type === NodeType.Text) {
      let content = node.data;
      for (const handler of sorted(this.textTransformHandlers)) {
        content = handler(ctx, content);
      }
      w.write(content);
      return RenderStatus.Success;
    }

    // - - B: the render handlers - - //
    for (const handler of sorted(this.renderHandlers)) {
      if (handler(ctx, w, node) === RenderStatus.Success) {
        return RenderStatus.Success;
      }
    }

    // - - C: the fallback - - //
    return this.renderFallback(ctx, w, node);
  }

  private renderFallback(ctx: Context, w: Writer, node: Node): RenderStatus {
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

  // - - - - - - - - - - - - - Entry points - - - - - - - - - - - - - //

  /**
   * Converts an already parsed document to markdown.
   *
   * Note that the node tree is *mutated* during conversion.
   */
  convertNode(doc: Node, options: ConvertOptions = {}): string {
    if (this.initError !== null) {
      // Plugin initialization can fail (e.g. option validation). This is the
      // first opportunity to report it.
      throw this.initError;
    }

    // If there are no render handlers registered this is usually a user
    // error, since people want the commonmark plugin in 99% of cases.
    if (this.renderHandlers.length === 0) {
      throw new Error(
        'no render handlers are registered. did you forget to register the "commonmark" and "base" plugins?',
      );
    }

    if (
      this.registeredPlugins.includes("commonmark") &&
      !this.registeredPlugins.includes("base")
    ) {
      throw new Error('you registered the "commonmark" plugin but the "base" plugin is also required');
    }

    const ctx = new ConverterContext(this, new GlobalState(), options.domain ?? "");

    // Pre-Render
    for (const handler of sorted(this.preRenderHandlers)) {
      handler(ctx, doc);
    }

    // Render
    const w = new StringWriter();
    this.renderNode(ctx, w, doc);

    // Post-Render
    let result = w.toString();
    for (const handler of sorted(this.postRenderHandlers)) {
      result = handler(ctx, result);
    }

    return result;
  }

  /** Parses the HTML string and converts it to markdown. */
  convertString(html: string, options: ConvertOptions = {}): string {
    return this.convertNode(parse(html), options);
  }
}
