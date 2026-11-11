/** Decorative only: colors never enter saved article metadata or dictionary identity. */
export const NOTE_TAPE_COLORS = ["sage", "mist", "wheat", "lilac", "rose"] as const;
export type NoteTapeColor = typeof NOTE_TAPE_COLORS[number];
export function randomNoteTape(random: () => number = Math.random): NoteTapeColor {
  return NOTE_TAPE_COLORS[Math.max(0, Math.min(NOTE_TAPE_COLORS.length - 1, Math.floor(random() * NOTE_TAPE_COLORS.length)))]!;
}
/** Stable decorative color for terms without a source note; no cache or persisted metadata. */
export function termNoteTape(key: string): NoteTapeColor {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return NOTE_TAPE_COLORS[(hash >>> 0) % NOTE_TAPE_COLORS.length]!;
}
