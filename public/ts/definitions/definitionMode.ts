export type DefinitionMode = "general" | "context" | "article";
export const DEFINITION_MODES: readonly DefinitionMode[] = ["general", "context", "article"];
export const nextDefinitionMode = (mode: DefinitionMode): DefinitionMode => DEFINITION_MODES[(DEFINITION_MODES.indexOf(mode) + 1) % DEFINITION_MODES.length]!;
export const DEFINITION_MODE_KEY = "er_definition_mode_v1";
export const DEFAULT_DEFINITION_MODE: DefinitionMode = "context";
export const isDefinitionMode = (value: unknown): value is DefinitionMode => value === "general" || value === "context" || value === "article";
export class DefinitionModePreference {
  mode: DefinitionMode = DEFAULT_DEFINITION_MODE;
  constructor(private storage: () => Pick<Storage, "getItem" | "setItem">) {}
  restore() {
    try { const mode = this.storage().getItem(DEFINITION_MODE_KEY); this.mode = isDefinitionMode(mode) ? mode : DEFAULT_DEFINITION_MODE; return true; }
    catch { return false; }
  }
  cycle() { return this.set(nextDefinitionMode(this.mode)); }
  set(mode: DefinitionMode) {
    this.mode = mode;
    try { this.storage().setItem(DEFINITION_MODE_KEY, mode); return true; } catch { return false; }
  }
}
export const definitionModePreference = new DefinitionModePreference(() => localStorage);
