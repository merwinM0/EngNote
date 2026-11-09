import type { TextEdit } from "./documentFormatting";

export const PARAGRAPH_PROMPT = "Only tidy paragraph breaks in this English text: join broken lines and separate paragraphs with one blank line. Preserve every word, number, punctuation mark, capitalization, font-independent symbol, tab and existing horizontal spacing. Do not correct spelling, rewrite, summarize, add headings or change content. Only change whitespace involving line breaks. Output only the text, without Markdown or explanations.";

/** An AI promise is not a content-integrity check: validate exact tokens before any edit. */
export function paragraphTidying(before: string, output: string): { text: string; edits: TextEdit[] } {
  const proposed = output.replace(/\r\n?/g, "\n");
  const originalTokens = Array.from(before.matchAll(/\S+/gu)), tokens = Array.from(proposed.matchAll(/\S+/gu));
  const invalid = () => new Error("Paragraph tidying changed words, punctuation or horizontal spacing. The original article and formatting were kept.");
  if (!originalTokens.length || tokens.length !== originalTokens.length || originalTokens.some((token, index) => token[0] !== tokens[index]![0])) throw invalid();
  const edits: TextEdit[] = [];
  for (let index = 1; index < originalTokens.length; index++) {
    const previous = originalTokens[index - 1]!, current = originalTokens[index]!, oldStart = previous.index + previous[0].length;
    const gap = before.slice(oldStart, current.index), next = proposed.slice(tokens[index - 1]!.index + tokens[index - 1]![0].length, tokens[index]!.index);
    if (gap === next) continue;
    if (/[^ \n]/.test(gap) || /[^ \n]/.test(next) || !gap.includes("\n") && !next.includes("\n")) throw invalid();
    // Horizontal indentation and multiple spaces are not the AI's responsibility either.
    if (gap.replace(/\n/g, "").length > 1 || next.replace(/\n/g, "").length > 1) throw invalid();
    edits.push({ start: oldStart, end: current.index, value: next });
  }
  let text = before;
  for (const edit of [...edits].reverse()) text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
  return { text, edits };
}
