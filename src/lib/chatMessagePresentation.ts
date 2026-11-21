/**
 * A standalone one-digit message can accidentally inherit the composer underline
 * state. Keep rich-text underlining everywhere else, but render this tiny numeric
 * payload as a normal chat token instead of a link-like underlined character.
 */
export function normalizeStandaloneNumericUnderline(body: string): string {
  return body.replace(/^(\s*)\+\+([0-9])\+\+(\s*)$/, '$1$2$3');
}
