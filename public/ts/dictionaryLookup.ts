import { dictionaryBatches, dictionaryKey, parseDictionaryResponse } from "./dictionary";
import type { BilingualMeaning } from "./dictionary";
import { AIResponseError } from "./deepseekClient";

export type DictionaryTarget = { term: string; offset: number; existing?: BilingualMeaning; cacheExisting?: boolean };
type Cache = { get(term: string): BilingualMeaning | undefined; set(term: string, meaning: BilingualMeaning): void };
type Request = (terms: string[], signal?: AbortSignal) => Promise<string>;
export type DictionaryResolution = { definitions: Array<BilingualMeaning & { term: string; offset: number }>; kept: number; cached: number; requested: number; error?: string };

/** Resolve locally first, deduplicate exact terms, then request bounded batches once each. */
export async function lookupDefinitions(targets: DictionaryTarget[], cache: Cache, request: Request,
  options: { refresh?: boolean; signal?: AbortSignal; onBatch?: (index: number, total: number) => void } = {}): Promise<DictionaryResolution> {
  const { refresh = false, signal } = options;
  signal?.throwIfAborted();
  const result: DictionaryResolution = { definitions: [], kept: 0, cached: 0, requested: 0 };
  const meanings = new Map<string, BilingualMeaning>(), pending = new Map<string, string>();
  if (!refresh) for (const target of targets) {
    if (target.existing && target.cacheExisting && !cache.get(target.term)) cache.set(target.term, target.existing);
  }
  const unresolved: DictionaryTarget[] = [];
  for (const target of targets) {
    if (!refresh && target.existing) { result.kept++; continue; }
    unresolved.push(target);
    const key = dictionaryKey(target.term), saved = refresh ? undefined : cache.get(key);
    if (saved) { meanings.set(key, saved); result.cached++; }
    else pending.set(key, key);
  }
  const batches = dictionaryBatches([...pending.values()]);
  for (const [index, terms] of batches.entries()) {
    signal?.throwIfAborted();
    options.onBatch?.(index + 1, batches.length);
    let raw: string, partial = false;
    try {
      result.requested += terms.length;
      try { raw = await request(terms, signal); }
      catch (error) {
        if (!(error instanceof AIResponseError) || error.finishReason !== "length") throw error;
        raw = error.partialContent; partial = true; result.error = error.message + " Completed definitions were kept; retry only missing terms.";
      }
      signal?.throwIfAborted();
      for (const [key, meaning] of parseDictionaryResponse(raw, partial)) {
        // Never cache or apply unsolicited terms, even if the model returned them.
        if (!terms.includes(key)) continue;
        meanings.set(key, meaning); cache.set(key, meaning);
      }
      if (partial) break; // Keep paid-for complete entries; do not automatically regenerate them.
    } catch (error) {
      signal?.throwIfAborted();
      result.error = error instanceof Error ? error.message : "Definitions could not be fetched.";
      break; // Authentication/network/format failures never trigger a retry or further paid batches.
    }
  }
  for (const target of unresolved) {
    const meaning = meanings.get(dictionaryKey(target.term));
    if (meaning) result.definitions.push({ ...meaning, term: dictionaryKey(target.term), offset: target.offset });
  }
  // A valid but empty response is a failure to define the selected terms, not a silent success.
  if (!result.error && unresolved.length && !result.definitions.length) result.error = "The AI returned no usable bilingual definitions. No automatic retry was sent.";
  return result;
}
