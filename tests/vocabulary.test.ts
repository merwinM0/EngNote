import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { articleVocabulary, readVocabularyItem, vocabularyKey } from "../public/ts/vocabulary/vocabulary";
import { initVocabulary, listVocabulary, storeVocabulary } from "../backend/vocabulary";
import { openDatabase } from "../backend/database";
import { deleteUserWithArticles, previewUser } from "../backend/userAdmin";

const fox = { term: "fox", english: "an animal", chinese: "狐狸", language: "en" as const, britishIPA: "/fɒks/" };
describe("article vocabulary", () => {
  test("extracts all pages, matches phrase identities and includes English-only legacy notes", () => {
    const text = "take off『leave the ground』\n\n" + "body ".repeat(1200) + "fox『an animal』";
    expect(articleVocabulary(text, [{ start: 8, term: "take off", english: "leave the ground", chinese: "起飞", language: "zh" }])).toEqual([
      { term: "take off", english: "leave the ground", chinese: "起飞", language: "zh", start: 8 },
      { term: "fox", english: "an animal", language: "en", start: text.lastIndexOf("『") },
    ]);
    expect(articleVocabulary("fox『an animal』", [{ start: 3, term: "wolf", english: "an animal", chinese: "动物", language: "en" }])[0]?.term).toBe("fox");
    expect(articleVocabulary("fox『an animal』", [{ start: 3, term: "fox", english: "wrong", chinese: "错误", language: "zh" }])[0]?.chinese).toBeUndefined();
  });
  test("deduplicates ordinary sentence case and whitespace, preserves acronyms, uses the last occurrence", () => {
    expect(vocabularyKey("  Take\n off ")).toBe("take off");
    expect(vocabularyKey("it’s")).toBe(vocabularyKey("it's"));
    expect(vocabularyKey("US")).not.toBe(vocabularyKey("us"));
    const items = articleVocabulary("Fox『animal』 fox『a newer meaning』 US『a country』 us『a pronoun』");
    expect(items).toHaveLength(3); expect(items[0]?.english).toBe("a newer meaning");
    const phrase = "It’s\n fine『acceptable』";
    expect(articleVocabulary(phrase, [{ start: phrase.indexOf("『"), term: "It's fine", english: "acceptable", chinese: "没问题", language: "en" }])[0]?.term).toBe("It's fine");
  });
  test("rejects invalid terms, meanings, language and IPA without accepting HTML or arbitrary metadata", () => {
    expect(readVocabularyItem(fox)).toEqual(fox);
    expect(readVocabularyItem({ ...fox, term: "  fox  ", key: "forged", user_id: 99 })).toEqual(fox);
    for (const item of [null, {}, { ...fox, term: "<b>fox</b>" }, { ...fox, english: "x".repeat(601) }, { ...fox, chinese: "only English" }, { ...fox, language: "fr" }, { ...fox, language: ["en"] }, { ...fox, britishIPA: "bad" }]) expect(readVocabularyItem(item)).toBeNull();
    expect(articleVocabulary("『orphan note』 123『no word』 fox『" + "x".repeat(601) + "』")).toEqual([]);
  });
});
describe("durable, private vocabulary", () => {
  test("upserts by user, keeps repeated reads/saves stable and never resurrects a removed account", () => {
    const db = openDatabase(":memory:");
    try {
      db.exec("INSERT INTO users (email,password_hash) VALUES ('a@example.com','x'),('b@example.com','x')");
      expect(storeVocabulary(db, 1, [fox], 100)).toBe(true);
      storeVocabulary(db, 1, [{ ...fox, term: "Fox", language: "zh" }], 200);
      expect(listVocabulary(db, 1, "", 0, 100).items).toEqual([{ ...fox, updated_at: 100 }]);
      storeVocabulary(db, 1, [{ ...fox, chinese: "小狐狸" }], 100);
      storeVocabulary(db, 2, [{ ...fox, chinese: "别的解释" }], 300);
      expect(listVocabulary(db, 1, "小狐狸", 0, 100).items[0]?.updated_at).toBe(101);
      expect(listVocabulary(db, 1, "别的", 0, 100).total).toBe(0);
      db.exec("DELETE FROM users WHERE id=1");
      expect(storeVocabulary(db, 1, [fox])).toBe(false);
    } finally { db.close(); }
  });
  test("one-time backfill keeps newest owned meanings and never changes articles or reimports on restart", () => {
    const db = openDatabase(":memory:");
    try {
      db.exec("DROP TABLE vocabulary; INSERT INTO users (email,password_hash) VALUES ('a@example.com','x');");
      const insert = db.query("INSERT INTO entries(title,content,owner_email,updated_at) VALUES ('Old',?,?,?)");
      insert.run("fox『old meaning』", "a@example.com", 1); insert.run("Fox『new meaning』", "a@example.com", 2);
      insert.run("wolf『unowned meaning』", null, 3); insert.run("hare『other meaning』", "missing@example.com", 4);
      const before = db.query("SELECT * FROM entries").all();
      initVocabulary(db);
      expect(listVocabulary(db, 1, "", 0, 100).items.map(item => item.english)).toEqual(["new meaning"]);
      storeVocabulary(db, 1, [fox], 5); initVocabulary(db);
      expect(listVocabulary(db, 1, "", 0, 100).items[0]?.english).toBe("an animal");
      expect(db.query("SELECT * FROM entries").all()).toEqual(before);
    } finally { db.close(); }
  });
  test("reopening a file database preserves permanent entries and their timestamps", () => {
    const directory = mkdtempSync(join(tmpdir(), "engnote-vocabulary-persist-")), path = join(directory, "test.db");
    try {
      const db = openDatabase(path);
      db.exec("INSERT INTO users(email,password_hash) VALUES ('a@example.com','x')");
      storeVocabulary(db, 1, [fox], 123);
      db.close();
      const reopened = openDatabase(path);
      try { expect(listVocabulary(reopened, 1, "", 0, 100).items).toEqual([{ ...fox, updated_at: 123 }]); }
      finally { reopened.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  test("user removal rechecks vocabulary changes, backs it up and atomically removes only its owner's records", () => {
    const directory = mkdtempSync(join(tmpdir(), "engnote-vocabulary-")), db = openDatabase(":memory:");
    try {
      db.exec("INSERT INTO users (email,password_hash) VALUES ('a@example.com','x'),('b@example.com','x')");
      storeVocabulary(db, 1, [fox]); storeVocabulary(db, 2, [fox]);
      const preview = previewUser(db, "1")!;
      expect(preview.vocabulary).toBe(1);
      storeVocabulary(db, 1, [{ ...fox, chinese: "新释义" }]);
      expect(() => deleteUserWithArticles(db, preview, directory)).toThrow("重新查看");
      db.exec("CREATE TRIGGER reject_vocab_delete BEFORE DELETE ON vocabulary BEGIN SELECT RAISE(ABORT,'blocked'); END");
      expect(() => deleteUserWithArticles(db, previewUser(db, "1")!, directory)).toThrow("blocked");
      expect(listVocabulary(db, 1, "", 0, 100).total).toBe(1);
      db.exec("DROP TRIGGER reject_vocab_delete");
      const result = deleteUserWithArticles(db, previewUser(db, "1")!, directory);
      expect(result.vocabulary).toBe(1);
      expect(listVocabulary(db, 1, "", 0, 100).total).toBe(0);
      expect(listVocabulary(db, 2, "", 0, 100).total).toBe(1);
      const backup = new Database(result.backup, { readonly: true });
      try { expect(listVocabulary(backup, 1, "", 0, 100).items[0]?.chinese).toBe("新释义"); } finally { backup.close(); }
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
