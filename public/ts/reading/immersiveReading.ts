import type { Definition } from "../definitions/definitionViews";

/** Presentation only: never include this state in article data, drafts or history. */
export class ImmersiveReading {
  active = false;
  private revealedIds = new Set<number>();
  private revealedVersions = new Set<string>();

  private key(note: Definition) {
    // Exclude display language; include position so repeated words stay independent.
    return JSON.stringify([note.start, note.english, note.chinese, note.britishIPA, note.term, note.mode, note.contextKey]);
  }
  reveal(note: Definition) {
    this.revealedIds.add(note.id);
    this.revealedVersions.add(this.key(note));
  }
  concealed(note: Definition) {
    if (!this.active) return false;
    // IDs follow ordinary offset edits; versions reconnect notes recreated by undo/redo.
    if (!this.revealedIds.has(note.id) && !this.revealedVersions.has(this.key(note))) return true;
    this.reveal(note);
    return false;
  }
  reset() {
    this.active = false;
    this.revealedIds.clear();
    this.revealedVersions.clear();
  }
}
