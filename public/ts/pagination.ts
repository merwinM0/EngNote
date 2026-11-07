/** Lossless pagination. All Unicode code points count, including punctuation and whitespace. */
export const PAGE_LIMIT = 5000;
export const DOCUMENT_LIMIT = 100000; // UTF-16 units, matching the persisted API limit.
export const characterCount = (text: string) => Array.from(text).length;
export type Page = { text: string; start: number; end: number; count: number };

export function paginate(text: string, limit = PAGE_LIMIT): Page[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid page limit.");
  const chars = Array.from(text);
  const pages: Page[] = [];
  let start = 0;
  let unitOffset = 0;
  while (start < chars.length) {
    let end = Math.min(start + limit, chars.length);
    if (end < chars.length) {
      const chunk = chars.slice(start, end).join("");
      const minimum = Math.floor(limit * .7);
      // Prefer a paragraph, sentence or word boundary without dropping any separators.
      let boundary = chunk.lastIndexOf("\n\n");
      if (boundary >= minimum) boundary += 2;
      else {
        const sentences = Array.from(chunk.matchAll(/[.!?][\s]+/g));
        const sentence = sentences.at(-1);
        boundary = sentence && sentence.index >= minimum ? sentence.index + sentence[0].length : -1;
        if (boundary < 0) {
          const spaces = Array.from(chunk.matchAll(/\s+/g));
          const space = spaces.at(-1);
          if (space && space.index >= minimum) boundary = space.index + space[0].length;
        }
      }
      if (boundary > 0) end = start + characterCount(chunk.slice(0, boundary));
      const candidate = chars.slice(start, end).join("");
      const noteStart = candidate.lastIndexOf("『");
      if (noteStart > candidate.lastIndexOf("』") && noteStart > 0) {
        // Keep a normal-sized definition with its word when it straddles the boundary.
        const anchor = candidate.slice(0, noteStart).match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*$/);
        const safeCut = anchor ? noteStart - anchor[0].length : noteStart;
        if (safeCut > 0) end = start + characterCount(candidate.slice(0, safeCut));
      }
    }
    const value = chars.slice(start, end).join("");
    pages.push({ text: value, start: unitOffset, end: unitOffset + value.length, count: end - start });
    unitOffset += value.length;
    start = end;
  }
  return pages.length ? pages : [{ text: "", start: 0, end: 0, count: 0 }];
}

export class ReadingDocument {
  text = "";
  pages: Page[] = paginate("");
  index = 0;
  revision = 0;
  get page(): Page { return this.pages[this.index]!; }

  setText(text: string, page: number | "last" = 0) {
    if (text.length > DOCUMENT_LIMIT) throw new Error("An article can contain at most 100,000 characters. Your existing article has been kept.");
    this.text = text;
    this.pages = paginate(text);
    this.index = page === "last" ? this.pages.length - 1 : Math.max(0, Math.min(page, this.pages.length - 1));
    this.revision++;
  }

  select(index: number) { this.index = Math.max(0, Math.min(index, this.pages.length - 1)); }

  locate(offset: number): number {
    return Math.max(0, this.pages.findIndex((page, index) => offset < page.end || index === this.pages.length - 1));
  }

  replaceRange(start: number, end: number, value: string, focusOffset = start + value.length) {
    if (start < 0 || end < start || end > this.text.length) throw new Error("Invalid document range.");
    this.setText(this.text.slice(0, start) + value + this.text.slice(end));
    this.index = this.locate(focusOffset);
  }

  editPage(value: string, cursor: number): { cursor: number; changedPage: boolean } {
    const previous = this.index;
    const { start, end } = this.page;
    const absoluteCursor = start + Math.max(0, Math.min(cursor, value.length));
    this.replaceRange(start, end, value, absoluteCursor);
    return { cursor: absoluteCursor - this.page.start, changedPage: previous !== this.index };
  }
}
