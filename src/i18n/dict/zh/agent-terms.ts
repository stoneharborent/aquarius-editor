// Chinese language data the runtime needs even though the UI is English-source:
// keyword lists the agent matches against Chinese user input, Chinese filler words the
// transcript editor strips, and the Chinese copy of runtime messages that are branched on
// locale rather than looked up through t(). It lives with the other zh dictionaries so no
// Chinese text has to sit in the (English) source files themselves.

/** Read-only intent phrases: a Chinese request containing one of these must not mutate the project. */
export const ZH_READ_ONLY_TERMS = ['不要修改', '不要编辑', '只读'] as const;

/** "Other" option prefixes in a follow-up widget answer. */
export const ZH_OTHER_OPTION_PREFIXES = ['其他'] as const;

/** Chinese filler words removed alongside the English ones ("um", "uh", …). */
export const ZH_FILLER_WORDS = ['嗯', '呃', '啊', '唔', '额'] as const;

/** Regex alternation of the same filler words, for inline transcript scanning. */
export const ZH_FILLER_PATTERN = '嗯|呃|啊|唔|额';

/** Chinese copy for the "some tool calls failed" run summary (see toolFailure.ts). */
export const zhToolFailureSummary = (details: string): string =>
  `有工具调用失败，未能完成请求（${details}）。本次没有成功执行的记录。`;
