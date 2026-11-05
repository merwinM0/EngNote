/** Pure text rules, shared by rendering and tests. Keep punctuation and numbers. */
export function sanitizeEnglish(text: string): { clean: string; hadBad: boolean } {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[^\x20-\x7e\n\t\u00a0\u2010-\u201f\u2026]/g, "");
  return { clean: clean.trim(), hadBad: clean !== text.replace(/\r\n?/g, "\n") };
}
export function sanitizeTitle(title: string): { clean: string; hadBad: boolean } {
  const clean = title.replace(/\p{Script=Han}/gu, "").trim();
  return { clean, hadBad: /\p{Script=Han}/u.test(title) };
}
export function parseParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}
export type Piece = { type: "plain" | "note"; text: string };
export function splitParagraph(text: string): Piece[] {
  return text.split(/(『[^』]*』)/g).filter(Boolean).map(part =>
    part.startsWith("『") && part.endsWith("』")
      ? { type: "note", text: part.slice(1, -1) }
      : { type: "plain", text: part });
}
export const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;

/** Local import reflow: preserve punctuation/numbers/Unicode, join broken lines. */
export function reflowText(text: string): string {
  return parseParagraphs(text.replace(/\u0000/g, "")).join("\n\n");
}
