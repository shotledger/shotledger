/**
 * Splits an info-sheet body into paragraphs. A translated help text is one
 * i18n string, so a blank line is the only paragraph break available to it;
 * single newlines are source wrapping and collapse to a space.
 */
export function toParagraphs(body: string): string[] {
  return body
    .split(/\n[^\S\n]*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}
