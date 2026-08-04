/**
 * Port of internal/textutils — string manipulation shared by the plugins.
 */

import { MARKER_CODE_BLOCK_NEWLINE } from "./marker.js";
import { trimLeftSpace, trimRightSpace, trimSpace } from "./unicode.js";

// - - - - - - - - - - - - - Code fences - - - - - - - - - - - - - //

/**
 * Counts the longest run of `fenceChar` inside the content.
 */
export function calculateCodeFenceOccurrences(fenceChar: string, content: string): number {
  let max = 0;
  let charsTogether = 0;

  for (const char of content) {
    // We encountered a fence character, now count how many
    // are directly afterwards
    if (char === fenceChar) {
      charsTogether++;
    } else if (charsTogether !== 0) {
      if (charsTogether > max) {
        max = charsTogether;
      }
      charsTogether = 0;
    }
  }

  // If the last element in the content was a fenceChar
  if (charsTogether !== 0 && charsTogether > max) {
    max = charsTogether;
  }

  return max;
}

/**
 * Returns the fence that should wrap the given code content. The fence always
 * needs at least one more character than any run inside the content, and at
 * least three in total.
 */
export function calculateCodeFence(fenceChar: string, content: string): string {
  let repeat = calculateCodeFenceOccurrences(fenceChar, content);

  // The outer fence block always has to have
  // at least one character more than any content inside
  repeat++;

  // You have to have at least three fence characters
  // to be recognized as a code block
  if (repeat < 3) {
    repeat = 3;
  }

  return fenceChar.repeat(repeat);
}

// - - - - - - - - - - - - - Inline code - - - - - - - - - - - - - //

export function collapseInlineCodeContent(content: string): string {
  let s = content.replaceAll("\n", " ").replaceAll("\t", " ");
  s = trimSpace(s);

  let out = "";
  let count = 0;
  for (const char of s) {
    if (char === " ") {
      count++;
    } else {
      count = 0;
    }

    if (count > 1) {
      continue;
    }
    out += char;
  }

  return out;
}

// - - - - - - - - - - - - - Newlines - - - - - - - - - - - - - //

export function trimUnnecessaryHardLineBreaks(content: string): string {
  let s = content.replaceAll("  \n\n", "\n\n");
  s = s.replaceAll("  \n  \n", "\n\n");
  s = s.replaceAll("  \n \n", "\n\n");
  return s;
}

/** Collapses runs of more than two newlines down to two. */
export function trimConsecutiveNewlines(input: string): string {
  let result = "";
  let newlineCount = 0;
  let spaceBuffer = "";

  for (const char of input) {
    if (char === "\n") {
      newlineCount++;
      if (newlineCount <= 2) {
        // Preserve up to 2 newlines, including preceding spaces
        result += spaceBuffer;
        result += "\n";
        spaceBuffer = "";
      } else {
        // Skip additional newlines
        spaceBuffer = "";
      }
    } else if (char === " ") {
      // Collect spaces into the space buffer
      spaceBuffer += char;
    } else {
      // Reset newline count and append non-newline characters
      newlineCount = 0;
      result += spaceBuffer;
      result += char;
      spaceBuffer = "";
    }
  }

  // Append any trailing spaces
  result += spaceBuffer;

  return result;
}

// - - - - - - - - - - - - - Spaces - - - - - - - - - - - - - //

/**
 * Splits the content into [leadingSpaces, trimmedContent, trailingSpaces].
 *
 * Markdown delimiters cannot have whitespace directly inside them, so the
 * surrounding whitespace has to be moved outside of the delimiters.
 */
export function surroundingSpaces(content: string): [string, string, string] {
  const rightTrimmed = trimRightSpace(content);
  const rightExtra = content.slice(rightTrimmed.length);

  const trimmed = trimLeftSpace(rightTrimmed);
  const leftExtra = content.slice(0, rightTrimmed.length - trimmed.length);

  return [leftExtra, trimmed, rightExtra];
}

/**
 * Puts the delimiter on every line that has content, instead of only at the
 * very start and end. Otherwise bold/italic would not be recognized across
 * newlines.
 */
export function delimiterForEveryLine(text: string, delimiter: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const [leftExtra, trimmed, rightExtra] = surroundingSpaces(line);

    if (trimmed === "") {
      // For empty lines, we don't need a delimiter
      out.push(leftExtra + rightExtra);
    } else {
      out.push(leftExtra + delimiter + trimmed + delimiter + rightExtra);
    }
  }

  return out.join("\n");
}

const DOUBLE_SPACE = "  ";
const HARD_LINE_BREAK = "  \n";
const ESCAPED_NO_CONTENT_LINE_BREAK = "\\\n";

/** Deals with multiline content inside a link or a heading. */
export function escapeMultiLine(content: string): string {
  const parts = content.split("\n");
  if (parts.length === 1) {
    return content;
  }

  let output = "";
  for (let i = 0; i < parts.length; i++) {
    const trimmedLeft = trimLeftSpace(parts[i]!);

    if (trimmedLeft.length === 0) {
      // A blank line would interrupt the link.
      // So we need to escape the line
      output += ESCAPED_NO_CONTENT_LINE_BREAK;
      continue;
    }

    const isLast = i === parts.length - 1;
    if (isLast) {
      // For the last line we don't need to add any "\n" anymore
      output += trimmedLeft;
      continue;
    }

    if (trimmedLeft.endsWith(DOUBLE_SPACE)) {
      // We already have "  " so adding a "\n" is enough
      output += trimmedLeft + "\n";
    } else {
      // We *prefer* having a hard-line-break "  \n"
      output += trimmedLeft + HARD_LINE_BREAK;
    }
  }

  return output;
}

// - - - - - - - - - - - - - Prefixing - - - - - - - - - - - - - //

/** Puts `repl` in front of the content and after every newline. */
export function prefixLines(source: string, repl: string): string {
  let out = repl;
  for (const char of source) {
    out += char;
    if (char === "\n") {
      out += repl;
    }
  }
  return out;
}

/** Indents every line of a list item, including code block newlines. */
export function indentMultiLineListItem(content: string, indentCount: number): string {
  const lines = content.split("\n");
  const indent = " ".repeat(indentCount);
  const indentedCodeBlockNewline = MARKER_CODE_BLOCK_NEWLINE + indent;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Add indent to code block newlines
    const line = lines[i]!.replaceAll(MARKER_CODE_BLOCK_NEWLINE, indentedCodeBlockNewline);

    // The first line is already indented through the prefix,
    // all other lines need the correct amount of spaces.
    out.push(i === 0 ? line : indent + line);
  }

  return out.join("\n");
}

// - - - - - - - - - - - - - Quotes - - - - - - - - - - - - - //

export function surroundBy(content: string, chars: string): string {
  return chars + content + chars;
}

/** Wraps the content in whichever quote character does not appear inside it. */
export function surroundByQuotes(content: string): string {
  if (content.length === 0) {
    return "";
  }

  const containsDoubleQuote = content.includes('"');
  const containsSingleQuote = content.includes("'");

  if (containsDoubleQuote && containsSingleQuote) {
    // Escape all quotes
    return surroundBy(content.replaceAll('"', '\\"'), '"');
  }
  if (containsDoubleQuote) {
    // Since it contains double quotes (but no single quotes)
    // we can surround it by single quotes
    return surroundBy(content, "'");
  }

  // It may contain single quotes, but definitely no double quotes,
  // so we can safely surround it by double quotes.
  return surroundBy(content, '"');
}
