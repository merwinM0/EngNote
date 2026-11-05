import { unzipSync, strFromU8 } from "fflate";
import { DOCUMENT_LIMIT } from "./pagination";

export const MAX_WORD_BYTES = 5 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;

/** Only decompress the main body, with limits checked before inflation. */
export function extractWordXml(bytes: Uint8Array): string {
  if (bytes.length > MAX_WORD_BYTES) throw new Error("Choose a Word document smaller than 5 MB.");
  let entries = 0;
  let expectedSize = 0;
  try {
    const files = unzipSync(bytes, { filter(file) {
      if (++entries > 2000) throw new Error("This Word document has too many embedded files.");
      if (file.name !== "word/document.xml") return false;
      if (file.originalSize > MAX_XML_BYTES) throw new Error("This Word document expands to too much content.");
      expectedSize = file.originalSize;
      return true;
    } });
    const body = files["word/document.xml"];
    if (!body || body.length !== expectedSize) throw new Error("No valid Word document body was found.");
    const xml = strFromU8(body);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported XML declarations in this document.");
    return xml;
  } catch (error) {
    if (error instanceof Error && !(error instanceof RangeError)) throw new Error(`Cannot import Word: ${error.message}`);
    throw new Error("This is not a readable .docx file, or it is damaged.");
  }
}

export function wordXmlToText(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("The Word document contains invalid XML.");
  const namespace = document.documentElement.namespaceURI;
  if (!namespace || !["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"].includes(namespace)) {
    throw new Error("This file is not a supported Word document.");
  }
  const body = document.getElementsByTagNameNS(namespace, "body")[0];
  if (!body) throw new Error("The Word document has no body text.");
  function read(node: Element): string {
    if (node.namespaceURI !== namespace) return "";
    if (["del", "instrText", "drawing", "pict", "object"].includes(node.localName)) return "";
    if (node.localName === "t") return node.textContent ?? "";
    if (node.localName === "tab") return "\t";
    if (node.localName === "br" || node.localName === "cr") return "\n";
    const text = Array.from(node.children, read).join("");
    return node.localName === "p" ? text + "\n\n" : text;
  }
  const text = read(body).trim();
  if (!text) throw new Error("This document contains no readable text. Scanned images are not supported.");
  if (text.length > DOCUMENT_LIMIT) throw new Error("The Word article is longer than 100,000 characters. Import a shorter section.");
  return text;
}

export async function importWord(file: File): Promise<string> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Please save this Word file as .docx first. Old .doc files are not supported.");
  if (file.size > MAX_WORD_BYTES) throw new Error("Choose a Word document smaller than 5 MB.");
  return wordXmlToText(extractWordXml(new Uint8Array(await file.arrayBuffer())));
}
