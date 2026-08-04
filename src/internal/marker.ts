/**
 * Private marker characters used to carry information through the render
 * pipeline without it showing up in the output.
 */

/**
 * Placed in front of a character that *may* need escaping. A later pass
 * decides whether it becomes a backslash or is dropped again.
 *
 * The bell character is used because it practically never appears in real
 * content.
 */
export const MARKER_ESCAPING = "\u0007";

/**
 * Stands in for a newline inside a code block, so that the "collapse too many
 * newlines" pass leaves the code contents untouched.
 */
export const MARKER_CODE_BLOCK_NEWLINE = "\uF002";
