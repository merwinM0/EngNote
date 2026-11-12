/** Independent of definition length. Legacy/malformed IPA never discards usable meanings. */
export function validBritishIPA(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 160
    && /^\/[^/]+\/$/u.test(value) && /[\p{L}]/u.test(value)
    && !/[^\p{Script=Latin}\p{Script=Greek}\p{M} ˈˌːˑ.‿|()\/]/u.test(value) && !/[\r\n\p{Cc}『』]/u.test(value);
}
export function withoutIPA(meaning: string, ipa?: string): string {
  if (!validBritishIPA(ipa)) return meaning;
  while (meaning.startsWith(ipa)) meaning = meaning.slice(ipa.length).trimStart();
  return meaning;
}
export function withIPA(meaning: string, ipa?: string): string {
  return validBritishIPA(ipa) ? `${ipa} ${withoutIPA(meaning, ipa)}` : meaning;
}
