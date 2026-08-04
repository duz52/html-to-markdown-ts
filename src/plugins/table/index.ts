import { Node, NodeType } from "../../dom/node.js";
import {
  findAllNodes,
  findFirstNode,
  getAttributeOr,
  nameIsHeading,
  nodeName,
} from "../../dom/helpers.js";
import { MARKER_ESCAPING } from "../../internal/marker.js";
import { trimSpace } from "../../internal/unicode.js";
import {
  PriorityStandard,
  RenderStatus,
  StringWriter,
  type Context,
  type Plugin,
  type RegisterTarget,
  type Writer,
} from "../../converter/types.js";
import {
  applyGroupedModifications,
  calculateMaxWidths,
  calculateModifications,
  cellDisplayWidth,
  fillUpRows,
  getNumberAttributeOr,
  removeEmptyRows,
  removeFirstRowIfEmpty,
  type Modification,
} from "./utils.js";

export { cellDisplayWidth, calculateMaxWidths } from "./utils.js";

/** How cells covered by a colspan/rowspan are filled in. */
export type SpanCellBehavior = "empty" | "mirror";
/** How table cells containing newlines are handled. */
export type NewlineBehavior = "skip" | "preserve";
/** How much padding is added inside table cells. */
export type CellPaddingBehavior = "aligned" | "minimal" | "none";

export interface TableOptions {
  /**
   * When a cell spans multiple columns or rows, the affected cells can either
   * be empty or repeat the content of the original cell.
   * @default "empty"
   */
  spanCellBehavior?: SpanCellBehavior;

  /**
   * Markdown tables don't support multiline content, so by default a table
   * with newlines in its cells is skipped. "preserve" replaces the newlines
   * with `<br />` instead.
   * @default "skip"
   */
  newlineBehavior?: NewlineBehavior;

  /**
   * "aligned" pads every cell to the width of the widest cell in its column,
   * so the columns line up in a monospace editor. "minimal" adds a single
   * space on each side. "none" adds no padding at all.
   * @default "aligned"
   */
  cellPaddingBehavior?: CellPaddingBehavior;

  /**
   * Omits rows where every cell is empty.
   * @default false
   */
  skipEmptyRows?: boolean;

  /**
   * Treats the first row as a header when the table has no explicit header
   * row (no `<th>` elements).
   * @default false
   */
  headerPromotion?: boolean;

  /**
   * Converts tables marked with `role="presentation"`. These usually describe
   * layout rather than tabular data, so they are skipped by default.
   * @default false
   */
  presentationTables?: boolean;
}

interface TableContent {
  alignments: string[];
  rows: string[][];
  caption: string;
}

class TablePlugin implements Plugin {
  private spanCellBehavior: SpanCellBehavior = "empty";
  private newlineBehavior: NewlineBehavior = "skip";
  private cellPaddingBehavior: CellPaddingBehavior = "aligned";
  private skipEmptyRows = false;
  private promoteFirstRowToHeader = false;
  private convertPresentationTables = false;

  constructor(private readonly options: TableOptions) {}

  name(): string {
    return "table";
  }

  init(conv: RegisterTarget): void {
    // Like the Go version, the options are validated here rather than in the
    // constructor, so the error is reported with the plugin name attached.
    this.spanCellBehavior = validate(
      "span cell behavior",
      this.options.spanCellBehavior,
      ["empty", "mirror"],
      "empty",
    );
    this.newlineBehavior = validate(
      "newline behavior",
      this.options.newlineBehavior,
      ["skip", "preserve"],
      "skip",
    );
    this.cellPaddingBehavior = validate(
      "cell padding behavior",
      this.options.cellPaddingBehavior,
      ["aligned", "minimal", "none"],
      "aligned",
    );
    this.skipEmptyRows = this.options.skipEmptyRows ?? false;
    this.promoteFirstRowToHeader = this.options.headerPromotion ?? false;
    this.convertPresentationTables = this.options.presentationTables ?? false;

    conv.register.escapedChar("|");
    conv.register.renderer((ctx, w, n) => this.handleRender(ctx, w, n), PriorityStandard);
  }

  private handleRender(ctx: Context, w: Writer, n: Node): RenderStatus {
    switch (nodeName(n)) {
      case "table":
        return this.renderTable(ctx, w, n);
      case "tr":
        // Normally, when the "table" gets rendered we do NOT go into this
        // case. But as a fallback we separate the rows through newlines.
        w.write("\n\n");
        ctx.renderChildNodes(w, n);
        w.write("\n\n");
        return RenderStatus.Success;
      default:
        return RenderStatus.TryNext;
    }
  }

  // - - - - - - - - - - - - - Render - - - - - - - - - - - - - //

  private renderTable(ctx: Context, w: Writer, n: Node): RenderStatus {
    const table = this.collectTableContent(ctx, n);
    if (table === null) {
      // Sometimes we just cannot render the table. Either because it is empty
      // OR because there are newlines inside the content (which would break
      // the table).
      return RenderStatus.TryNext;
    }

    // Sometimes we pad the cells with extra spaces (e.g. "| text    |").
    // For that we first need to know the maximum width of every column.
    const widths = calculateMaxWidths(table.rows);

    // Sometimes a row contains fewer cells than another row.
    // We then fill it up with empty cells (e.g. "| text |     |").
    table.rows = fillUpRows(table.rows, widths.length);

    w.write("\n\n");

    // - - - Header - - - //
    this.writeRow(w, widths, table.rows[0]!);
    w.write("\n");
    this.writeHeaderUnderline(w, table.alignments, widths);
    w.write("\n");

    // - - - Body - - - //
    for (const cells of table.rows.slice(1)) {
      this.writeRow(w, widths, cells);
      w.write("\n");
    }

    // - - - Caption - - - //
    if (table.caption !== "") {
      w.write("\n\n");
      w.write(table.caption);
    }

    w.write("\n\n");

    return RenderStatus.Success;
  }

  private writeHeaderUnderline(w: Writer, alignments: string[], widths: number[]): void {
    for (let i = 0; i < widths.length; i++) {
      const align = i < alignments.length ? alignments[i]! : "";

      if (i === 0) {
        w.write("|");
      }

      w.write(align === "left" || align === "center" ? ":" : "-");

      if (this.cellPaddingBehavior === "aligned") {
        w.write("-".repeat(widths[i]!));
      } else {
        w.write("-");
      }

      w.write(align === "right" || align === "center" ? ":" : "-");
      w.write("|");
    }
  }

  private writeRow(w: Writer, widths: number[], cells: string[]): void {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;

      if (i === 0) {
        w.write("|");
      }

      const filler = (widths[i] ?? 0) - cellDisplayWidth(cell);

      if (this.cellPaddingBehavior === "aligned" || this.cellPaddingBehavior === "minimal") {
        w.write(" ");
      }

      w.write(cell);

      if (this.cellPaddingBehavior === "aligned" && filler > 0) {
        w.write(" ".repeat(filler));
      }

      if (this.cellPaddingBehavior === "aligned" || this.cellPaddingBehavior === "minimal") {
        w.write(" ");
      }

      w.write("|");
    }
  }

  // - - - - - - - - - - - - - Collect - - - - - - - - - - - - - //

  private collectTableContent(ctx: Context, node: Node): TableContent | null {
    if (getAttributeOr(node, "role", "") === "presentation" && !this.convertPresentationTables) {
      // In HTML emails many nested tables are used for *layout purposes*
      // rather than for actual tabular data, which markdown cannot express.
      return null;
    }

    if (hasProblematicChildNode(node)) {
      // There are certain nodes (e.g. <hr />) that cannot be in a table.
      return null;
    }

    if (hasProblematicParentNode(node)) {
      // There are certain parent nodes (e.g. <a>) that cannot contain a table.
      // We would break the rendering of the link.
      return null;
    }

    const headerRowNode = selectHeaderRowNode(node);
    const normalRowNodes = selectNormalRowNodes(node, headerRowNode);

    const rows = this.collectRows(ctx, headerRowNode, normalRowNodes);
    if (rows.length === 0) {
      return null;
    }

    for (const cells of rows) {
      for (let j = 0; j < cells.length; j++) {
        if (!cells[j]!.includes("\n")) {
          continue;
        }
        if (this.newlineBehavior === "preserve") {
          cells[j] = cells[j]!.replaceAll("\n", "<br />");
          continue;
        }
        // We're configured to skip tables with newlines.
        return null;
      }
    }

    return {
      alignments: collectAlignments(headerRowNode, normalRowNodes),
      rows,
      caption: collectCaption(ctx, node),
    };
  }

  /**
   * Sometimes a cell *spans* over multiple columns or rows. What should be
   * displayed in those other cells — the same content or an empty string?
   */
  private getContentForMergedCell(originalContent: string): string {
    return this.spanCellBehavior === "mirror" ? originalContent : "";
  }

  private collectCellsInRow(
    ctx: Context,
    rowIndex: number,
    rowNode: Node,
  ): [string[], Modification[]] {
    const cellNodes = findAllNodes(rowNode, (node) => {
      const name = nodeName(node);
      return name === "th" || name === "td";
    });

    const cellContents: string[] = [];
    const modifications: Modification[] = [];

    for (let index = 0; index < cellNodes.length; index++) {
      const cellNode = cellNodes[index]!;

      const buf = new StringWriter();
      ctx.renderNodes(buf, cellNode);

      let content = trimSpace(buf.toString());

      // A "|" inside the content would mistakenly be recognized as part of
      // the table, so it always has to be escaped.
      content = content.replaceAll(MARKER_ESCAPING + "|", "\\|");
      content = ctx.unEscapeContent(content);

      cellContents.push(content);

      // - - col / row span - - //
      const rowSpan = getNumberAttributeOr(cellNode, "rowspan", 1);
      const colSpan = getNumberAttributeOr(cellNode, "colspan", 1);

      modifications.push(
        ...calculateModifications(
          rowIndex,
          index,
          rowSpan,
          colSpan,
          this.getContentForMergedCell(content),
        ),
      );
    }

    return [cellContents, modifications];
  }

  private collectRows(
    ctx: Context,
    headerRowNode: Node | null,
    rowNodes: Node[],
  ): string[][] {
    let rowContents: string[][] = [];
    const groupedModifications: Modification[][] = [];

    // - - 1. the header row - - //
    if (headerRowNode !== null) {
      const [cells, mods] = this.collectCellsInRow(ctx, 0, headerRowNode);
      rowContents.push(cells);
      groupedModifications.push(mods);
    } else {
      // There needs to be a *header* row so that the table is recognized.
      // So it is better to have an empty header row...
      rowContents.push([]);
    }

    // - - 2. the normal rows - - //
    for (let index = 0; index < rowNodes.length; index++) {
      const [cells, mods] = this.collectCellsInRow(ctx, index + 1, rowNodes[index]!);
      rowContents.push(cells);
      groupedModifications.push(mods);
    }

    // Apply the collected colspan/rowspan modifications by shifting cells around.
    rowContents = applyGroupedModifications(rowContents, groupedModifications);

    if (this.skipEmptyRows) {
      rowContents = removeEmptyRows(rowContents);
    }
    if (this.promoteFirstRowToHeader) {
      rowContents = removeFirstRowIfEmpty(rowContents);
    }

    return rowContents;
  }
}

/** Converts `<table>` elements to markdown tables. */
export function newTablePlugin(options: TableOptions = {}): Plugin {
  return new TablePlugin(options);
}

// - - - - - - - - - - - - - Selection - - - - - - - - - - - - - //

function selectHeaderRowNode(node: Node): Node | null {
  const thead = findFirstNode(node, (n) => nodeName(n) === "thead");
  if (thead !== null) {
    const firstTr = findFirstNode(thead, (n) => nodeName(n) === "tr");
    if (firstTr !== null) {
      // We found the "tr" inside the "thead"
      return firstTr;
    }
  }

  const firstTh = findFirstNode(node, (n) => nodeName(n) === "th");
  if (firstTh !== null) {
    return firstTh.parent;
  }

  return null;
}

function selectNormalRowNodes(tableNode: Node, selectedHeaderRowNode: Node | null): Node[] {
  const collected: Node[] = [];

  const finder = (node: Node): void => {
    if (nodeName(node) === "tr" && node !== selectedHeaderRowNode) {
      // Make sure to not select the header row a *second* time.
      collected.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      finder(child);
    }
  };
  finder(tableNode);

  return collected;
}

function hasProblematicChildNode(node: Node): boolean {
  return (
    findFirstNode(node, (n) => {
      const name = nodeName(n);
      if (nameIsHeading(name)) {
        return true;
      }
      switch (name) {
        case "table":
          // This is caught by the newline check anyway, but aborting early
          // saves some effort.
          return true;
        case "hr":
        case "ul":
        case "ol":
        case "blockquote":
          return true;
        default:
          return false;
      }
    }) !== null
  );
}

function hasProblematicParentNode(node: Node): boolean {
  for (let p = node.parent; p !== null; p = p.parent) {
    switch (nodeName(p)) {
      case "a":
      case "strong":
      case "b":
      case "em":
      case "i":
      case "del":
      case "s":
      case "strike":
        return true;
    }
  }
  return false;
}

function collectAlignments(headerRowNode: Node | null, rowNodes: Node[]): string[] {
  const firstRow = headerRowNode ?? rowNodes[0] ?? null;
  if (firstRow === null) {
    return [];
  }

  const cellNodes = findAllNodes(firstRow, (node) => {
    const name = nodeName(node);
    return name === "th" || name === "td";
  });

  return cellNodes.map((cellNode) => getAttributeOr(cellNode, "align", ""));
}

function collectCaption(ctx: Context, node: Node): string {
  const captionNode = findFirstNode(
    node,
    (n) => n.type === NodeType.Element && n.data === "caption",
  );
  if (captionNode === null) {
    return "";
  }

  const buf = new StringWriter();
  ctx.renderNodes(buf, captionNode);

  return trimSpace(buf.toString());
}

// - - - - - - - - - - - - - Option validation - - - - - - - - - - - - - //

function validate<T extends string>(
  label: string,
  value: T | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || (value as string) === "") {
    return fallback;
  }
  if (!allowed.includes(value)) {
    throw new Error(`unknown value ${JSON.stringify(value)} for ${label}`);
  }
  return value;
}
