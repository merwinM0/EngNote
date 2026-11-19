import type { Definition } from "../definitions/definitionViews";

/** Presentation only: never include this state in article data, drafts or history. */
export class ImmersiveReading {
  private enabled = false;
  private byId = new Map<number, { visible: boolean }>();
  private byVersion = new Map<string, { visible: boolean }>();

  get active() { return this.enabled; }
  set active(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.byId.clear(); this.byVersion.clear();
  }

  private key(note: Definition) {
    // Exclude display language; include position so repeated words stay independent.
    return JSON.stringify([note.start, note.english, note.chinese, note.britishIPA, note.term, note.mode, note.contextKey]);
  }
  private state(note: Definition, create = false) {
    const key = this.key(note);
    // IDs follow edits; both IDs and history versions share the same visibility state.
    const result = this.byId.get(note.id) ?? this.byVersion.get(key) ?? (create ? { visible: false } : undefined);
    if (result) { this.byId.set(note.id, result); this.byVersion.set(key, result); }
    return result;
  }
  toggle(note: Definition) {
    if (!this.active) return;
    const state = this.state(note, true)!;
    state.visible = !state.visible;
  }
  concealed(note: Definition) { return this.active && !this.state(note)?.visible; }
  reset() { this.active = false; }
}
