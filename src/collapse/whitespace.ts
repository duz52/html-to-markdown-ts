/**
 * Replaces every run of whitespace with a single space, the way HTML
 * rendering collapses whitespace.
 */
export function replaceAnyWhitespaceWithSpace(source: string): string {
  if (source === "") {
    return source;
  }

  let out = "";
  let changed = false;
  let startNormal = 0;
  let startMatch = -1;

  const isWhitespace = (char: string | undefined): boolean =>
    char === " " || char === "\r" || char === "\n" || char === "\t";

  for (let i = 0; i < source.length; i++) {
    const whitespace = isWhitespace(source[i]);

    if (startMatch === -1 && whitespace) {
      // Start of the whitespace run
      startMatch = i;
      continue;
    }
    if (startMatch !== -1 && whitespace) {
      // Middle of the whitespace run
      continue;
    }
    if (startMatch !== -1) {
      // The character after the whitespace run
      const count = i - startMatch;
      if (count === 1 && source[startMatch] === " ") {
        // There was only one whitespace character & that is a space.
        // So the replacement would be exactly the same...
      } else {
        out += source.slice(startNormal, startMatch);
        out += " ";
        startNormal = i;
        changed = true;
      }
      startMatch = -1;
    }
  }

  if (startMatch === -1) {
    if (!changed) {
      return source;
    }
    // Only the normal characters until the end still need to be added
    return out + source.slice(startNormal);
  }

  if (!changed && source.length - startMatch === 1 && source[startMatch] === " ") {
    // There is a trailing match, but it is exactly the same as the replacement
    return source;
  }

  // The trailing match still needs to be replaced
  out += source.slice(startNormal, startMatch);
  out += " ";
  return out;
}
