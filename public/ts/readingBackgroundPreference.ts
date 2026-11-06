export const READING_BACKGROUNDS = [
  { id: "original", name: "原本", description: "Original notebook" },
  { id: "yunlong", name: "云龙纸", description: "Long, cloud-like fibres" },
  { id: "cotton", name: "绵纸", description: "Soft cotton grain" },
  { id: "earth", name: "大地纸", description: "Natural flecks" },
  { id: "kraft", name: "牛皮纸", description: "Warm, unbleached kraft" },
  { id: "linen", name: "莱尼纸", description: "Fine linen weave" },
  { id: "art", name: "艺术纹理纸", description: "Soft sculpted ripples" },
  { id: "elegant", name: "雅纹纸", description: "Delicate embossed lines" },
  { id: "leather", name: "皮纹纸", description: "Supple, pebbled grain" },
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
