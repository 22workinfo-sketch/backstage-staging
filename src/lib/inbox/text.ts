export const TELEGRAM_TEXT_LIMIT = 4096;
export const MAX_REPLY_LENGTH = 65536;
const graphemes = new Intl.Segmenter("my", { granularity: "grapheme" });

// Count UTF-16 units conservatively. Preserve every character, including whitespace.
export function splitReply(text: string): string[] {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return [text];
  const parts: string[] = [];
  let part = "";
  let lastBreak = 0;
  function append(unit: string) {
    if (part.length + unit.length > TELEGRAM_TEXT_LIMIT) {
      // Prefer a word or line boundary when it will not produce a tiny part.
      const cut = lastBreak >= TELEGRAM_TEXT_LIMIT / 2 && part.length - lastBreak + unit.length <= TELEGRAM_TEXT_LIMIT
        ? lastBreak : part.length;
      parts.push(part.slice(0, cut));
      part = part.slice(cut);
      lastBreak = 0;
    }
    part += unit;
    if (/\s$/u.test(unit)) lastBreak = part.length;
  }
  for (const { segment } of graphemes.segment(text)) {
    if (segment.length <= TELEGRAM_TEXT_LIMIT) append(segment);
    else for (const codePoint of segment) append(codePoint);
  }
  if (part) parts.push(part);
  return parts;
}
