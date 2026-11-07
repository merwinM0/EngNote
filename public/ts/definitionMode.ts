export type DefinitionMode = "general" | "context" | "article";
export const DEFINITION_MODE_KEY = "er_definition_mode_v1";
export const isDefinitionMode = (value: unknown): value is DefinitionMode => value === "general" || value === "context" || value === "article";
export class DefinitionModePreference {
  mode: DefinitionMode = "general";
  constructor(private storage: () => Pick<Storage, "getItem" | "setItem">) {}
  restore() {
    try { const mode = this.storage().getItem(DEFINITION_MODE_KEY); this.mode = isDefinitionMode(mode) ? mode : "general"; return true; }
    catch { return false; }
  }
  set(mode: DefinitionMode) {
    this.mode = mode;
    try { this.storage().setItem(DEFINITION_MODE_KEY, mode); return true; } catch { return false; }
  }
}
export const definitionModePreference = new DefinitionModePreference(() => localStorage);
