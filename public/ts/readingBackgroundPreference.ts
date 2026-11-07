export const READING_BACKGROUNDS = [
  { id: "original" },
  { id: "linen" },
  { id: "art" },
  { id: "elegant" },
  { id: "leather" },
  { id: "earth" },
  { id: "kraft" },
  { id: "yunlong" },
  { id: "cotton" },
] as const;
export type ReadingBackground = typeof READING_BACKGROUNDS[number]["id"];
export const READING_BACKGROUND_STORAGE = "er_reading_background";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function isReadingBackground(value: unknown): value is ReadingBackground {
  return READING_BACKGROUNDS.some(background => background.id === value);
}

/** Only a local visual preference; never part of an article or account. */
export class ReadingBackgroundPreference {
  private current: ReadingBackground = "original";
  constructor(private readonly storage: () => PreferenceStorage) {}
  get background(): ReadingBackground { return this.current; }
  restore(): boolean {
    try {
      const saved = this.storage().getItem(READING_BACKGROUND_STORAGE);
      this.current = isReadingBackground(saved) ? saved : "original";
      return true;
    } catch { this.current = "original"; return false; }
  }
  select(background: ReadingBackground): boolean {
    this.current = background;
    try { this.storage().setItem(READING_BACKGROUND_STORAGE, background); return true; }
    catch { return false; } // A blocked write must not prevent changing the paper.
  }
}
