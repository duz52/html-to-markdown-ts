export type HeadingStyle = "atx" | "setext";
export type LinkStyle = "inlined" | "referenced_index" | "referenced_short";
export type LinkRenderingBehavior = "render" | "skip";

/** Renders the element as a link. */
export const LinkBehaviorRender: LinkRenderingBehavior = "render";
/** Skips link rendering and falls back to the other rules (e.g. paragraph). */
export const LinkBehaviorSkip: LinkRenderingBehavior = "skip";

export interface CommonmarkOptions {
  /**
   * "_" or "*"
   * @default "*"
   */
  emDelimiter?: string;

  /**
   * "**" or "__"
   * @default "**"
   */
  strongDelimiter?: string;

  /**
   * Any thematic break.
   * @default "* * *"
   */
  horizontalRule?: string;

  /**
   * "-", "+", or "*"
   * @default "-"
   */
  bulletListMarker?: string;

  /**
   * Whether an HTML comment is placed between two adjacent lists, so that
   * they are not parsed as one list.
   * @default true
   */
  listEndComment?: boolean;

  /**
   * "```" or "~~~"
   * @default "```"
   */
  codeBlockFence?: string;

  /**
   * "atx" renders `## Heading`, "setext" underlines the heading instead.
   * @default "atx"
   */
  headingStyle?: HeadingStyle;

  /**
   * How links with an *empty href* are rendered, e.g.
   * `<a href="">the link content</a>`.
   *
   * "render" produces "[the link content]()", "skip" produces
   * "the link content".
   * @default "render"
   */
  linkEmptyHrefBehavior?: LinkRenderingBehavior;

  /**
   * How links *without content* are rendered, e.g. `<a href="/page"></a>`.
   *
   * "render" produces "[](/page)", "skip" produces an empty string.
   * @default "render"
   */
  linkEmptyContentBehavior?: LinkRenderingBehavior;

  /** @default "inlined" */
  linkStyle?: LinkStyle;
}

export interface Config {
  emDelimiter: string;
  strongDelimiter: string;
  horizontalRule: string;
  bulletListMarker: string;
  disableListEndComment: boolean;
  codeBlockFence: string;
  headingStyle: HeadingStyle;
  linkStyle: LinkStyle;
  linkEmptyHrefBehavior: LinkRenderingBehavior;
  linkEmptyContentBehavior: LinkRenderingBehavior;
}

export function fillInDefaultConfig(opts: CommonmarkOptions): Config {
  return {
    // The default is "*" (rather than "_") as that works better inside words.
    emDelimiter: opts.emDelimiter || "*",
    strongDelimiter: opts.strongDelimiter || "**",
    horizontalRule: opts.horizontalRule || "* * *",
    bulletListMarker: opts.bulletListMarker || "-",
    disableListEndComment: opts.listEndComment === false,
    codeBlockFence: opts.codeBlockFence || "```",
    headingStyle: opts.headingStyle || "atx",
    linkStyle: opts.linkStyle || "inlined",
    linkEmptyHrefBehavior: opts.linkEmptyHrefBehavior || "render",
    linkEmptyContentBehavior: opts.linkEmptyContentBehavior || "render",
  };
}

/** Raised when an option has a value that cannot be rendered. */
export class ValidateConfigError extends Error {
  readonly key: string;
  readonly value: string;

  constructor(key: string, value: string, patternDescription: string) {
    super(`invalid value for ${key}:${JSON.stringify(value)} must be ${patternDescription}`);
    this.name = "ValidateConfigError";
    this.key = key;
    this.value = value;
  }
}

function countOccurrences(s: string, sub: string): number {
  return s.split(sub).length - 1;
}

export function validateConfig(cfg: Config): void {
  if (countOccurrences(cfg.emDelimiter, "_") !== 1 && countOccurrences(cfg.emDelimiter, "*") !== 1) {
    throw new ValidateConfigError(
      "EmDelimiter",
      cfg.emDelimiter,
      'exactly 1 character of "*" or "_"',
    );
  }

  if (
    countOccurrences(cfg.strongDelimiter, "_") !== 2 &&
    countOccurrences(cfg.strongDelimiter, "*") !== 2
  ) {
    throw new ValidateConfigError(
      "StrongDelimiter",
      cfg.strongDelimiter,
      'exactly 2 characters of "**" or "__"',
    );
  }

  if (
    countOccurrences(cfg.horizontalRule, "*") < 3 &&
    countOccurrences(cfg.horizontalRule, "_") < 3 &&
    countOccurrences(cfg.horizontalRule, "-") < 3
  ) {
    throw new ValidateConfigError(
      "HorizontalRule",
      cfg.horizontalRule,
      'at least 3 characters of "*", "_" or "-"',
    );
  }

  if (!["-", "+", "*"].includes(cfg.bulletListMarker)) {
    throw new ValidateConfigError(
      "BulletListMarker",
      cfg.bulletListMarker,
      'one of "-", "+" or "*"',
    );
  }

  if (!["```", "~~~"].includes(cfg.codeBlockFence)) {
    throw new ValidateConfigError(
      "CodeBlockFence",
      cfg.codeBlockFence,
      'one of "```" or "~~~"',
    );
  }

  if (!["atx", "setext"].includes(cfg.headingStyle)) {
    throw new ValidateConfigError(
      "HeadingStyle",
      cfg.headingStyle,
      'one of "atx" or "setext"',
    );
  }

  if (!["inlined", "referenced_index", "referenced_short"].includes(cfg.linkStyle)) {
    throw new ValidateConfigError(
      "LinkStyle",
      cfg.linkStyle,
      'one of "inlined", "referenced_index" or "referenced_short"',
    );
  }
}
