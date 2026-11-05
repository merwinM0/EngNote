import { expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { extractWordXml, MAX_WORD_BYTES } from "../public/ts/word";

const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello, 2026!</w:t></w:r></w:p></w:body></w:document>';
test("extracts only the main Word document, not embedded files", () => {
  const bytes = zipSync({ "word/document.xml": strToU8(xml), "word/media/ignore.bin": new Uint8Array(10000) });
  expect(extractWordXml(bytes)).toBe(xml);
});
test("rejects invalid, missing-body, and oversized Word archives", () => {
  expect(() => extractWordXml(strToU8("Not a ZIP"))).toThrow();
  expect(() => extractWordXml(zipSync({ "nothing.txt": strToU8("Hi") }))).toThrow("body");
  expect(() => extractWordXml(new Uint8Array(MAX_WORD_BYTES + 1))).toThrow("5 MB");
});
test("rejects oversized expanded XML before it is decompressed", () => {
  const bytes = zipSync({ "word/document.xml": strToU8("x".repeat(8 * 1024 * 1024 + 1)) });
  expect(bytes.length).toBeLessThan(MAX_WORD_BYTES);
  expect(() => extractWordXml(bytes)).toThrow("expands");
});
test("rejects DTD and entity declarations", () => {
  const bytes = zipSync({ "word/document.xml": strToU8('<!DOCTYPE x [<!ENTITY y "no">]>' + xml) });
  expect(() => extractWordXml(bytes)).toThrow("declarations");
});
