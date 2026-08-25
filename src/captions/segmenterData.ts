// Content-aware caption segmentation - word list/weight constant (no changes allowed).

/** English breakpoint pattern table: left word hit → the word is followed by a good breakpoint. */
export const LATIN_BREAK_PATTERNS: ReadonlyArray<{ pattern: RegExp; score: number }> = [
  { pattern: /[.!?:;,]$/, score: 100 },
];

/** English avoidance penalty pairs (12 items, order sensitive - stop on first hit).
 * Match "left word right word" as a whole, if hit, penalty will be deducted from breakpoint points. */
export const LATIN_PENALTY_PATTERNS: ReadonlyArray<{ pattern: RegExp; penalty: number }> = [
  { pattern: /^(a|an|the|i|we|you|he|she|it|they|this|that|these|those|and|but|or|so)[,;:]\s+\w+$/i, penalty: 95 },
  { pattern: /^(lot|lots|kind|kinds|sort|sorts|type|types|part|parts|number|numbers|couple|couples|bit|bits|piece|pieces|group|groups|bunch|series|set|sets|range|ranges|variety|varieties)\s+of$/i, penalty: 95 },
  { pattern: /^(and|but|or|so|yet|nor|for|however|although|because|since|while|whereas|who|which|that|where|when|why|whose|in|on|at|by|with|from|to|of|about|through|during|before|after|above|below|between|among|under|over|without|within|beyond|across|against|around|behind|beside|beneath|inside|outside|towards|throughout|upon|the|a|an)\s+\w+$/i, penalty: 90 },
  { pattern: /^(the|a|an|this|that|these|those)\s+\w+$/i, penalty: 60 },
  { pattern: /\w+(ed|ing|ly|er|est|ful|less|ous|ive|able|ible)\s+\w+$/i, penalty: 55 },
  { pattern: /^[A-Z][a-z]+\s+[A-Z][a-z]+$/, penalty: 70 },
  { pattern: /^(Dr|Mr|Mrs|Ms|Prof|President|Director|Professor|Minister|Secretary|Ambassador)\s+[A-Z][a-z]+$/i, penalty: 75 },
  { pattern: /^\w+\s+(up|down|in|out|on|off|over|under|through|around|across|along|away|back|forward|ahead|behind|beside|between|among|above|below|inside|outside|onto|into|upon|within|without|throughout|against|towards|beyond|beneath|underneath|alongside)$/i, penalty: 80 },
  { pattern: /^(I|you|he|she|it|we|they|this|that)\s+\w+$/i, penalty: 65 },
  { pattern: /^(can|will|would|could|should|might|may|must|have|has|had|do|does|did|am|is|are|was|were|being|been)\s+\w+$/i, penalty: 70 },
  { pattern: /^(not|never|no|nothing|nobody|nowhere|neither|none|hardly|scarcely|barely|seldom|rarely)\s+\w+$/i, penalty: 75 },
  { pattern: /^\d+\s+(years?|months?|weeks?|days?|hours?|minutes?|seconds?|miles?|kilometers?|feet|inches?|pounds?|kilograms?|degrees?|percent)$/i, penalty: 80 },
];

/** English short function words: orphan word risk - scoreLatinBreaks −40 when the next word is hit and the remaining words are ≤2. */
export const SHORT_FUNCTION_WORD =
  /^(a|an|the|of|in|on|at|by|to|for|with|and|but|or|if|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|might|may|must|can|shall)$/i;

// CJK punctuation, particle and interrogative data lives with the Chinese locale files
// (src/i18n/dict/zh/segmenter.ts) because it is language data, not source copy. Re-exported here
// so the segmenter keeps a single import surface.
export {
  CJK_PUNCT,
  MODAL_PARTICLES,
  CJK_PARTICLES,
  NO_LINE_START,
  CJK_WORD_SUFFIXES,
  QUESTION_TAIL,
  QUESTION_TAIL_EXCLUDE,
  QUESTION_HEAD,
} from '../i18n/dict/zh/segmenter';

/** English function words: judge latinFunction orphan words to be used at risk. */
export const LATIN_FUNCTION_WORDS = [
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'to', 'for', 'with', 'and', 'but', 'or', 'if', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'might', 'may', 'must', 'can', 'shall',
] as const;

/** Quantifier table: "X of" is not split (latinQuantifierOf orphan word risk). */
export const LATIN_QUANTIFIERS = [
  'bit', 'bits', 'bunch', 'couple', 'couples', 'group', 'groups', 'kind', 'kinds', 'lot', 'lots',
  'number', 'numbers', 'part', 'parts', 'piece', 'pieces', 'range', 'ranges', 'series', 'set', 'sets',
  'sort', 'sorts', 'type', 'types', 'varieties', 'variety',
] as const;

/** Pause noise reduction connectives: When these words end with a comma,
 * Small pauses of 150–400ms are not considered breakpoints (≥400ms are considered breakpoints). */
export const PAUSE_SUPPRESSED_CONNECTORS = [
  'a', 'an', 'and', 'but', 'he', 'i', 'it', 'or', 'she', 'so', 'that', 'the', 'these', 'they', 'this',
  'those', 'we', 'you',
] as const;

/** Pause breakpoint priority: interval ms → priority. */
export function pauseBreakPriority(gapMs: number): number {
  if (gapMs >= 400) return 90;
  if (gapMs >= 250) return 70;
  return 55;
}

/** When selecting a breakpoint, the risk of orphan words is reduced. */
export const ORPHAN_PICK_DEMOTION = 30;

/** The minimum interval and noise reduction threshold for a pause to become a breakpoint. */
export const PAUSE_MIN_MS = 150;
export const PAUSE_SUPPRESSED_MIN_MS = 400;
