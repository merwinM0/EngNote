import { describe, expect, test } from "bun:test";
import { ARTICLE_DRAFT_KEY, type ArticleDraft } from "../public/ts/articles/articleDraft";
import { ArticleWorkspaces, workspaceDraftKey } from "../public/ts/articles/articleWorkspace";

const text = "A fox『an animal』 reads.";
const draft: ArticleDraft = { version: 2, text, index: 0, offset: 0, entry: { id: 42, title: "Fox", savedText: text }, definitions: [{ start: 5, english: "an animal", chinese: "动物", language: "zh", britishIPA: "/fɒks/" }] };
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("private account and anonymous workspaces", () => {
  test("keeps guest, Alice and Bob drafts separate across reloads and deletes only the selected workspace", () => {
    const store = storage(), first = new ArticleWorkspaces(() => store);
    const guest = { ...draft, text: "Guest text.", entry: null, definitions: [] };
    first.write(null, guest); first.write("alice@example.com", draft);
    first.write("bob@example.com", { ...draft, entry: { ...draft.entry!, id: 43, title: "Bob" } });
    const reloaded = new ArticleWorkspaces(() => store);
    expect(reloaded.read(null)).toEqual(guest);
    expect(reloaded.read("alice@example.com")).toEqual(draft);
    expect(reloaded.read("bob@example.com")?.entry?.id).toBe(43);
    expect(reloaded.read("new@example.com")).toBeNull();
    reloaded.write("bob@example.com", null);
    expect(reloaded.read("bob@example.com")).toBeNull();
    expect(reloaded.read("alice@example.com")).toEqual(draft);
    expect(reloaded.read(null)).toEqual(guest);
    expect(workspaceDraftKey(null)).not.toBe(workspaceDraftKey("guest"));
    expect(store.values.has("er_api_key")).toBe(false);
  });
  test("does not restore unscoped legacy saved content to any user without explicit migration", () => {
    const store = storage(); store.setItem(ARTICLE_DRAFT_KEY, JSON.stringify(draft));
    const workspaces = new ArticleWorkspaces(() => store);
    expect(workspaces.read(null)).toBeNull();
    expect(workspaces.read("alice@example.com")).toBeNull();
    expect(workspaces.legacy()).toEqual(draft);
    expect(store.getItem(ARTICLE_DRAFT_KEY)).not.toBeNull();
    workspaces.write("alice@example.com", draft); workspaces.removeLegacy();
    expect(workspaces.legacy()).toBeNull();
    expect(workspaces.read("bob@example.com")).toBeNull();
    expect(workspaces.read("alice@example.com")).toEqual(draft);
  });
  test("validates persisted records and never treats guest association or client permissions as authorization", () => {
    const store = storage();
    store.setItem(workspaceDraftKey(null), JSON.stringify(draft));
    store.setItem(workspaceDraftKey("alice@example.com"), JSON.stringify({ ...draft, entry: { ...draft.entry, can_edit: true, owner_email: "alice@example.com" } }));
    const workspaces = new ArticleWorkspaces(() => store);
    expect(workspaces.read(null)?.entry).toBeNull();
    workspaces.write(null, draft);
    expect(workspaces.read(null)?.entry).toBeNull();
    expect(workspaces.read("alice@example.com")?.entry).toEqual(draft.entry);
    expect(workspaces.read("alice@example.com")?.definitions).toEqual(draft.definitions);
    store.setItem(workspaceDraftKey("bob@example.com"), "invalid JSON");
    expect(workspaces.read("bob@example.com")).toBeNull();
    expect(workspaces.read("alice@example.com")).toEqual(draft);
  });
  test("blocked browser storage retains isolated in-memory drafts without blocking account changes", () => {
    const workspaces = new ArticleWorkspaces(() => { throw new Error("blocked"); });
    expect(workspaces.write("alice@example.com", draft)).toBe(false);
    expect(workspaces.write(null, { ...draft, entry: null })).toBe(false);
    expect(workspaces.read("bob@example.com")).toBeNull();
    expect(workspaces.read("alice@example.com")).toEqual(draft);
    expect(workspaces.read(null)?.entry).toBeNull();
    expect(workspaces.write(null, null)).toBe(false);
    expect(workspaces.read("alice@example.com")).toEqual(draft);
  });
});
