import { unzipSync, strFromU8 } from "fflate";
import { wordPartsToDocument, type WordImport, type WordParts } from "./wordFormattingImport";

export const MAX_WORD_BYTES = 5 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;

/** Only decompress text/style parts; never inflate embedded files or external resources. */
export function extractWordParts(bytes: Uint8Array): WordParts {
  if (bytes.length > MAX_WORD_BYTES) throw new Error("Choose a Word document smaller than 5 MB.");
  let entries = 0;
  let expectedSize = 0;
  const allowed = new Set(["word/document.xml", "word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml"]);
  try {
    const files = unzipSync(bytes, { filter(file) {
      if (++entries > 2000) throw new Error("This Word document has too many embedded files.");
      if (!allowed.has(file.name)) return false;
      expectedSize += file.originalSize;
      if (expectedSize > MAX_XML_BYTES) throw new Error("This Word document expands to too much content.");
      return true;
    } });
    if (!files["word/document.xml"] || Object.values(files).reduce((size, file) => size + file.length, 0) !== expectedSize) throw new Error("No valid Word document body was found.");
    const parts: WordParts = {};
    for (const [name, bytes] of Object.entries(files)) {
      const xml = strFromU8(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported XML declarations in this document.");
      parts[name] = xml;
    }
    return parts;
  } catch (error) {
    if (error instanceof Error && !(error instanceof RangeError)) throw new Error(`Cannot import Word: ${error.message}`);
    throw new Error("This is not a readable .docx file, or it is damaged.");
  }
}

export const extractWordXml = (bytes: Uint8Array): string => extractWordParts(bytes)["word/document.xml"]!;
export const wordXmlToText = (xml: string): string => wordPartsToDocument({ "word/document.xml": xml }).text;

export async function importWord(file: File): Promise<WordImport> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Please save this Word file as .docx first. Old .doc files are not supported.");
  if (file.size > MAX_WORD_BYTES) throw new Error("Choose a Word document smaller than 5 MB.");
  return wordPartsToDocument(extractWordParts(new Uint8Array(await file.arrayBuffer())));
}
