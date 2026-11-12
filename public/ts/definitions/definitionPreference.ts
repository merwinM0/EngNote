export type DefinitionLanguage = "en" | "zh";
export const DEFINITION_LANGUAGE_STORAGE = "er_default_definition_language";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** A non-secret browser preference, independent of the tab's confirmed API key. */
export class DefinitionLanguagePreference {
  private current: DefinitionLanguage = "en";
  constructor(private readonly storage: () => PreferenceStorage) {}
  get language(): DefinitionLanguage { return this.current; }
  restore(): boolean {
    try {
      this.current = this.storage().getItem(DEFINITION_LANGUAGE_STORAGE) === "zh" ? "zh" : "en";
      return true;
    } catch { this.current = "en"; return false; }
  }
  toggle(): boolean {
    this.current = this.current === "en" ? "zh" : "en";
    try { this.storage().setItem(DEFINITION_LANGUAGE_STORAGE, this.current); return true; }
    catch { return false; } // Keep the new choice usable in memory when storage is blocked.
  }
}

export const definitionLanguagePreference = new DefinitionLanguagePreference(() => localStorage);
