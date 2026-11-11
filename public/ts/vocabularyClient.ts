import { getEmail } from "./auth";
import { api, jsonBody } from "./util";
import { VOCABULARY_BATCH_LIMIT, type VocabularyItem } from "./vocabulary";
let epoch = 0;
window.addEventListener("session-changed", () => { epoch++; });
export const captureVocabularyAccount = () => ({ email: getEmail(), epoch });
/** Never replay anonymous/old-account notes after login or account switches. No hidden retry queue. */
export async function saveVocabularyItems(items: readonly VocabularyItem[], account = captureVocabularyAccount()): Promise<{ saved: true } | { saved: false; error: unknown } | null> {
  const current = () => !!account.email && account.email === getEmail() && account.epoch === epoch;
  if (!items.length || !current()) return null;
  try {
    for (let offset = 0; offset < items.length; offset += VOCABULARY_BATCH_LIMIT) {
      if (!current()) return null;
      const batch = items.slice(offset, offset + VOCABULARY_BATCH_LIMIT).map(({ term, english, chinese, britishIPA, language }) => ({ term, english, chinese, britishIPA, language }));
      await api("/api/vocabulary", { method: "POST", ...jsonBody({ items: batch }) });
    }
    if (!current()) return null;
    window.dispatchEvent(new Event("vocabulary-updated"));
    return { saved: true };
  } catch (error) { return current() ? { saved: false, error } : null; }
}
