/**
 * Port of internal/escape.
 *
 * During rendering, every character that *could* have a special markdown
 * meaning gets a placeholder in front of it. These functions then decide,
 * for a given position, whether the character really is markdown syntax and
 * therefore has to be escaped with a backslash.
 *
 * Each function returns how many characters the construct spans, or -1 if
 * this is not the construct in question.
 */

import { MARKER_ESCAPING } from "./marker.js";
import { isSpaceCodePoint } from "./unicode.js";

const PLACEHOLDER = MARKER_ESCAPING;

export type UnEscapeFn = (chars: string, index: number) => number;

// - - - - - - - - - - - - - Lookup helpers - - - - - - - - - - - - - //

/** The previous character, skipping over placeholders. "" if there is none. */
function getPrev(chars: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (chars[i] === PLACEHOLDER) {
      continue;
    }
    return chars[i]!;
  }
  return "";
}

/** The next character, skipping over placeholders. "" if there is none. */
function getNext(chars: string, index: number): string {
  for (let i = index + 1; i < chars.length; i++) {
    if (chars[i] === PLACEHOLDER) {
      continue;
    }
    return chars[i]!;
  }
  return "";
}

/** The next code point, skipping over placeholders. 0 if there is none. */
export function getNextAsCodePoint(chars: string, index: number): number {
  for (let i = index + 1; i < chars.length; i++) {
    if (chars[i] === PLACEHOLDER) {
      continue;
    }
    return chars.codePointAt(i)!;
  }
  return 0;
}

/** The previous code point, skipping over placeholders. 0 if there is none. */
function getPrevAsCodePoint(chars: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (chars[i] === PLACEHOLDER) {
      continue;
    }
    // Step back over a low surrogate so that we read the full code point.
    const code = chars.charCodeAt(i);
    if (i > 0 && code >= 0xdc00 && code <= 0xdfff) {
      const high = chars.charCodeAt(i - 1);
      if (high >= 0xd800 && high <= 0xdbff) {
        return chars.codePointAt(i - 1)!;
      }
    }
    return chars.codePointAt(i)!;
  }
  return 0;
}

// The list rules in Go check a single *byte* against a small whitespace set
// rather than the full Unicode space property. Keeping that narrower set
// here avoids treating e.g. an em space as a list marker separator.
const listSeparatorSpaces = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0]);

/** True for the end of the content, or a whitespace character. */
function isSpaceOrEmpty(char: string): boolean {
  if (char === "") {
    return true;
  }
  return listSeparatorSpaces.has(char.codePointAt(0)!);
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/**
 * Reports whether only spaces and placeholders separate this index from the
 * start of its line — i.e. whether the character is the first thing on the line.
 */
function isAtLineStart(chars: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const char = chars[i];
    if (char === "\n") {
      return true;
    }
    if (char === PLACEHOLDER || char === " ") {
      continue;
    }
    return false;
  }
  return true;
}

// - - - - - - - - - - - - - The elements - - - - - - - - - - - - - //

export const isBackslash: UnEscapeFn = (chars, index) => {
  if (chars[index] !== "\\") {
    return -1;
  }
  return 1;
};

export const isInlineCode: UnEscapeFn = (chars, index) => {
  if (chars[index] !== "`") {
    return -1;
  }
  return 1;
};

export const isFencedCode: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "`" && char !== "~") {
    return -1;
  }

  if (!isAtLineStart(chars, index)) {
    return -1;
  }

  let count = 1;
  let i = index + 1;
  for (; i < chars.length; i++) {
    if (chars[i] === PLACEHOLDER) {
      continue;
    }
    if (chars[i] === "`" || chars[i] === "~") {
      count++;
      continue;
    }
    break;
  }
  if (count < 3) {
    return -1;
  }

  return i - index;
};

export const isDivider: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "-" && char !== "_" && char !== "*") {
    return -1;
  }

  if (!isAtLineStart(chars, index)) {
    return -1;
  }

  let count = 1;
  let lastChar = chars.length;
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i];
    if (c === PLACEHOLDER || c === " ") {
      continue;
    }
    if (c === char) {
      count++;
      continue;
    }
    if (c === "\n") {
      lastChar = i;
      break;
    }
    return -1;
  }

  if (count >= 3) {
    return lastChar - index;
  }
  return -1;
};

export const isAtxHeader: UnEscapeFn = (chars, index) => {
  if (chars[index] !== "#") {
    return -1;
  }

  if (!isAtLineStart(chars, index)) {
    return -1;
  }

  let poundSigns = 1;
  for (let i = index + 1; i < chars.length; i++) {
    const char = chars[i];
    if (char === "#") {
      poundSigns++;
      if (poundSigns > 6) {
        return -1;
      }
      continue;
    }
    if (char === PLACEHOLDER) {
      continue;
    }
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      // Returns the count of # that we encountered
      return i - index;
    }
    return -1;
  }
  return 1;
};

export const isSetextHeader: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "=" && char !== "-") {
    return -1;
  }

  let newlineCount = 0;
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i];
    if (c === PLACEHOLDER || c === " ") {
      continue;
    }

    if (c === "\n") {
      newlineCount++;
      continue;
    }

    if (newlineCount === 0) {
      // Without any newlines, this character is on the same line
      // as the delimiter. So the delimiter is inside a normal text...
      return -1;
    } else if (newlineCount === 1) {
      // The heading content is on the line above the delimiter
      // which qualifies for a setext heading...
      return 1;
    } else {
      return -1;
    }
  }

  return -1;
};

export const isBlockQuote: UnEscapeFn = (chars, index) => {
  if (chars[index] !== ">") {
    return -1;
  }

  if (!isAtLineStart(chars, index)) {
    return -1;
  }

  return 1;
};

export const isItalicOrBold: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "*" && char !== "_") {
    return -1;
  }

  const next = getNextAsCodePoint(chars, index);
  if (next === 0 || isSpaceCodePoint(next)) {
    // "not followed by Unicode whitespace"
    return -1;
  }

  return 1;
};

export const isUnorderedList: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "-" && char !== "*" && char !== "+") {
    return -1;
  }

  if (!isAtLineStart(chars, index)) {
    return -1;
  }

  if (isSpaceOrEmpty(getNext(chars, index))) {
    return 1;
  }

  return -1;
};

export const isOrderedList: UnEscapeFn = (chars, index) => {
  const char = chars[index];
  if (char !== "." && char !== ")") {
    return -1;
  }

  // Directly before the dot needs to be a digit
  const prev = getPrevAsCodePoint(chars, index);
  if (prev === 0 || !isDigit(String.fromCodePoint(prev))) {
    return -1;
  }

  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i]!;
    if (c === "\n") {
      break;
    }
    if (c === " " || c === PLACEHOLDER || isDigit(c)) {
      continue;
    }
    return -1;
  }

  if (isSpaceOrEmpty(getNext(chars, index))) {
    return 1;
  }

  return -1;
};

export const isImageOrLink: UnEscapeFn = (chars, index) => {
  if (chars[index] === "!") {
    // It could be the start of an image
    return chars[index + 1] === "[" ? 1 : -1;
  }

  if (chars[index] === "[") {
    for (let i = index + 1; i < chars.length; i++) {
      if (chars[i] === "\n") {
        return -1;
      }
      if (chars[i] === "]") {
        return 1;
      }
    }
    return -1;
  }

  return -1;
};

// Exported for the strikethrough plugin, which needs the same "not followed
// by whitespace" rule for its "~" delimiter.
export { getPrev, getNext };
