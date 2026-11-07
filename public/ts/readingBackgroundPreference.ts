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
export const READING_PAPER_COLORS = ["mist", "moon", "qing", "wheat", "rose", "lilac"] as const;
export type ReadingPaperColor = typeof READING_PAPER_COLORS[number];
export const READING_PAPER_COLOR_STORAGE = "er_reading_paper_color";
export function isReadingPaperColor(value: unknown): value is ReadingPaperColor {
  return READING_PAPER_COLORS.some(color => color === value);
}
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function isReadingBackground(value: unknown): value is ReadingBackground {
  return READING_BACKGROUNDS.some(background => background.id === value);
}

/** Only a local visual preference; never part of an article or account. */
export class ReadingBackgroundPreference {
  private current: ReadingBackground = "original";
  private currentColor: ReadingPaperColor = "mist";
  constructor(private readonly storage: () => PreferenceStorage) {}
  get background(): ReadingBackground { return this.current; }
  get color(): ReadingPaperColor { return this.currentColor; }
  restore(): boolean {
    try {
      const saved = this.storage().getItem(READING_BACKGROUND_STORAGE);
      this.current = isReadingBackground(saved) ? saved : "original";
      const color = this.storage().getItem(READING_PAPER_COLOR_STORAGE);
      this.currentColor = isReadingPaperColor(color) ? color : "mist";
      return true;
    } catch { this.current = "original"; this.currentColor = "mist"; return false; }
  }
  selectColor(color: ReadingPaperColor): boolean {
    this.currentColor = color;
    try { this.storage().setItem(READING_PAPER_COLOR_STORAGE, color); return true; }
    catch { return false; }
  }
  select(background: ReadingBackground): boolean {
    this.current = background;
    try { this.storage().setItem(READING_BACKGROUND_STORAGE, background); return true; }
    catch { return false; } // A blocked write must not prevent changing the paper.
  }
}
