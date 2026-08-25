// Chinese / Japanese / Korean language data for the content-aware caption segmenter.
// This is functional linguistic data, not UI copy — it cannot be translated, so it lives with the
// Chinese locale files rather than in the (English-source) caption code. Do not edit the word
// lists without a segmentation test to back the change; src/captions/segmenterData.ts re-exports
// everything here.

/** CJK punctuation classification. */
export const CJK_PUNCT = {
  clauseBreak: ['，', '；', '：', '、', '､'],
  quoteEnd: ['”', '’', '）', '】', '》', '」', '』', '〉'],
  sentenceEnd: ['。', '！', '？', '…', '．', '｡'],
} as const;

/** Modal particles: at the end of the left word, with the right word starting with a CJK
 * character, they mark a good break point (break after, priority 60). */
export const MODAL_PARTICLES = ['啊', '吧', '呗', '哈', '啦', '嘛', '呢', '哦', '呀'] as const;

/** Structural / clitic particles (Japanese and Korean particles included): when the last word on
 * the left or the first word on the right hits this list the break point is marked orphanRisk
 * (its weight drops by 30 when a break point is picked). */
export const CJK_PARTICLES = [
  '的', '地', '得', '了', '着', '过', '是', '在', '有', '和', '与', '或', '及', '并', '但', '而', '却',
  '因', '为', '由', '若', '如', '虽', '然', '则', '即', '便', '把', '被', '让', '给', '对', '向', '从',
  '到', '于', '按', '依', '据', '以', '吗', '呢', '吧', '啊', '呀', '哦', '哇', '嘛', '呐', '这', '那',
  '些', '个', '位', '一', '二', '三', '几', '多', '少',
  'は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만',
] as const;

/** Particles that may not start a line: when a page starts with one of these, words are pulled
 * back from the previous page and merged into this one. */
export const NO_LINE_START = [
  '的', '地', '得', '了', '着', '过', '个', '些', '们', '吗', '呢', '吧', '啊', '呀', '哦', '哇', '嘛',
  '呐', '下',
  'は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만',
] as const;

/** CJK suffixes: when the left word is CJK and the right word hits this list, do not split. */
export const CJK_WORD_SUFFIXES = ['们', '化', '性', '者', '度', '流', '栈', '后'] as const;

/** CJK interrogative patterns (two rules, priority 58 break point). */
export const QUESTION_TAIL = /(?:有|没有|还有|是|是不是|叫|做|干|看到|看见|找到)(?:什么|啥|谁|哪里|哪儿)$/u;
export const QUESTION_TAIL_EXCLUDE = /(?:为|凭)什么$/u;
export const QUESTION_HEAD = /^(?:我|你|您|他|她|它|这|那|咱|我们|你们|他们|她们|现在|然后|接着|对了)/u;
