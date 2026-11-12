import { describe, expect, test } from "bun:test";
import { LatestArticleOnLogin } from "../public/ts/articles/articleAutoOpen";

const entries = [{ id: 9, title: "Most recently modified" }, { id: 3, title: "Older" }];
describe("latest article on an empty signed-in workspace", () => {
  test("waits for workspace recovery even when the sorted private list arrives first", () => {
    const restore = new LatestArticleOnLogin<typeof entries[number]>();
    restore.reset(true);
    expect(restore.take(entries, false, true)).toBeNull();
    expect(restore.take(entries, true, true)).toBe(entries[0]!);
    expect(restore.take(entries, true, true)).toBeNull();
  });
  test("waits for the private list if workspace recovery completes first", () => {
    const restore = new LatestArticleOnLogin<typeof entries[number]>();
    restore.reset(true);
    expect(restore.take(null, true, true)).toBeNull();
    expect(restore.take(entries, true, true)).toBe(entries[0]!);
  });
  test("a recovered draft or explicit user action consumes the one attempt instead of reopening after a later clear", () => {
    const restore = new LatestArticleOnLogin<typeof entries[number]>();
    restore.reset(true);
    expect(restore.take(entries, true, false)).toBeNull();
    expect(restore.take(entries, true, true)).toBeNull();
    restore.reset(true);
    expect(restore.take(entries, true, true)).toBe(entries[0]!);
  });
  test("does not retry empty accounts on later saves, or load anything while anonymous", () => {
    const restore = new LatestArticleOnLogin<typeof entries[number]>();
    restore.reset(false);
    expect(restore.take(entries, true, true)).toBeNull();
    restore.reset(true);
    expect(restore.take([], true, true)).toBeNull();
    expect(restore.take(entries, true, true)).toBeNull();
  });
  test("session changes cancel pending recovery and arm only the new signed-in session", () => {
    const restore = new LatestArticleOnLogin<typeof entries[number]>();
    restore.reset(true);
    expect(restore.take(entries, false, true)).toBeNull();
    restore.reset(false);
    expect(restore.take(entries, true, true)).toBeNull();
    restore.reset(true);
    expect(restore.take([{ id: 21, title: "Other account" }], true, true)?.id).toBe(21);
    expect(restore.take(entries, true, true)).toBeNull();
  });
});
