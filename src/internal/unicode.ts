/**
 * Whitespace helpers that follow Go's `unicode.IsSpace` exactly.
 *
 * JavaScript's own `\s` and `String.prototype.trim()` use a slightly
 * different set (they include U+FEFF and exclude U+0085), which would make
 * the port drift from the Go output on unusual input.
 */

const spaceCodePoints = new Set([
  0x09, // \t
  0x0a, // \n
  0x0b, // \v
  0x0c, // \f
  0x0d, // \r
  0x20, // space
  0x85, // NEL
  0xa0, // NBSP
  0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
]);

/** Matches Go's `unicode.IsSpace`. */
export function isSpaceCodePoint(cp: number): boolean {
  return spaceCodePoints.has(cp);
}

export function isSpaceChar(char: string): boolean {
  const cp = char.codePointAt(0);
  return cp !== undefined && isSpaceCodePoint(cp);
}

/** Matches Go's `bytes.TrimLeftFunc(s, unicode.IsSpace)`. */
export function trimLeftSpace(s: string): string {
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i)!;
    if (!isSpaceCodePoint(cp)) {
      break;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return s.slice(i);
}

/** Matches Go's `bytes.TrimRightFunc(s, unicode.IsSpace)`. */
export function trimRightSpace(s: string): string {
  let end = s.length;
  while (end > 0) {
    // Step back over a possible surrogate pair.
    let start = end - 1;
    const code = s.charCodeAt(start);
    if (start > 0 && code >= 0xdc00 && code <= 0xdfff) {
      const high = s.charCodeAt(start - 1);
      if (high >= 0xd800 && high <= 0xdbff) {
        start -= 1;
      }
    }
    const cp = s.codePointAt(start)!;
    if (!isSpaceCodePoint(cp)) {
      break;
    }
    end = start;
  }
  return s.slice(0, end);
}

/** Matches Go's `bytes.TrimSpace`. */
export function trimSpace(s: string): string {
  return trimLeftSpace(trimRightSpace(s));
}

/** Matches Go's `unicode.IsDigit` for the ASCII range. */
export function isDigitChar(char: string): boolean {
  return char >= "0" && char <= "9";
}
