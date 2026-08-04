/**
 * The two halves of the escaping strategy.
 *
 * While rendering, {@link escapeContent} puts a placeholder in front of every
 * character that *could* be markdown syntax. Once the whole document is
 * rendered, {@link unEscapeContent} looks at each placeholder in context and
 * decides whether it becomes a backslash or simply disappears.
 *
 * Doing it in two passes means the decision can use information — like
 * whether the character starts a line — that is not available while the
 * fragment is being rendered.
 */

import { MARKER_ESCAPING } from "../internal/marker.js";
import type { UnEscapeFn } from "./types.js";

const PLACEHOLDER = MARKER_ESCAPING;

const ACTION_KEEP = 0;
const ACTION_ESCAPE = 1;

export function escapeContent(content: string, isEscapedChar: (char: string) => boolean): string {
  let out = "";

  for (const char of content) {
    if (char === "\u0000") {
      // For security reasons, U+0000 must be replaced with U+FFFD.
      out += "\uFFFD";
      continue;
    }

    if (isEscapedChar(char)) {
      out += PLACEHOLDER + char;
    } else {
      out += char;
    }
  }

  return out;
}

export function unEscapeContent(content: string, handlers: UnEscapeFn[]): string {
  const checkElements = (index: number): number => {
    for (const handler of handlers) {
      const skip = handler(content, index);
      if (skip !== -1) {
        return skip;
      }
    }
    return -1;
  };

  const changes = new Uint8Array(content.length).fill(ACTION_KEEP);

  for (let index = 0; index < content.length; index++) {
    if (content[index] !== PLACEHOLDER) {
      continue;
    }
    if (index + 1 >= content.length) {
      break;
    }

    const skip = checkElements(index + 1);
    if (skip === -1) {
      continue;
    }
    changes[index] = ACTION_ESCAPE;
    index += skip - 1;
  }

  let out = "";
  for (let index = 0; index < content.length; index++) {
    const char = content[index]!;
    if (char !== PLACEHOLDER) {
      out += char;
      continue;
    }

    // What to do with this placeholder? Should we escape or not?
    if (changes[index] === ACTION_ESCAPE) {
      out += "\\";
    }
  }

  return out;
}
