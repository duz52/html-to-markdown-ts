import { Node } from "../../dom/node.js";
import { nodeName } from "../../dom/helpers.js";
import { mergeAdjacent, removeRedundant } from "../../internal/domutils.js";
import { delimiterForEveryLine } from "../../internal/textutils.js";
import { getNextAsCodePoint } from "../../internal/escape.js";
import { isSpaceCodePoint } from "../../internal/unicode.js";
import {
  PriorityStandard,
  RenderStatus,
  StringWriter,
  type Context,
  type Plugin,
  type RegisterTarget,
  type Writer,
} from "../../converter/types.js";

export interface StrikethroughOptions {
  /** @default "~~" */
  delimiter?: string;
}

const nameIsStrikethrough = (node: Node): boolean => {
  const name = nodeName(node);
  return name === "del" || name === "s" || name === "strike";
};

const nameIsBothStrikethrough = (a: Node, b: Node): boolean =>
  nameIsStrikethrough(a) && nameIsStrikethrough(b);

class StrikethroughPlugin implements Plugin {
  private readonly delimiter: string;

  constructor(options: StrikethroughOptions) {
    this.delimiter = options.delimiter || "~~";
  }

  name(): string {
    return "strikethrough";
  }

  init(conv: RegisterTarget): void {
    conv.register.preRenderer((_ctx, doc) => {
      removeRedundant(doc, nameIsBothStrikethrough);
      mergeAdjacent(doc, nameIsStrikethrough);
    }, PriorityStandard);

    conv.register.escapedChar("~");
    conv.register.unEscaper(handleUnEscape, PriorityStandard);

    conv.register.renderer((ctx, w, n) => this.handleRender(ctx, w, n), PriorityStandard);
  }

  private handleRender(ctx: Context, w: Writer, n: Node): RenderStatus {
    if (!nameIsStrikethrough(n)) {
      return RenderStatus.TryNext;
    }

    const buf = new StringWriter();
    ctx.renderChildNodes(buf, n);

    // If there is a newline character between the start and end delimiter the
    // delimiters won't be recognized, so put them on every line instead.
    w.write(delimiterForEveryLine(buf.toString(), this.delimiter));

    return RenderStatus.Success;
  }
}

function handleUnEscape(chars: string, index: number): number {
  if (chars[index] !== "~") {
    return -1;
  }

  const next = getNextAsCodePoint(chars, index);
  if (next === 0 || isSpaceCodePoint(next)) {
    // "not followed by Unicode whitespace"
    return -1;
  }

  return 1;
}

/** Converts `<strike>`, `<s>`, and `<del>` elements. */
export function newStrikethroughPlugin(options: StrikethroughOptions = {}): Plugin {
  return new StrikethroughPlugin(options);
}
