// Native Chinese names for the bundled and catalogued CJK fonts. These are font identifiers,
// not UI copy — a user (or the agent) may ask for a font by its Chinese name, and the font
// resolver matches against these aliases. They live with the zh dictionary so no Chinese text
// has to sit in the English-source font tables.

/** Bundled local fonts: English family name → its Chinese aliases. */
export const ZH_LOCAL_FONT_ALIASES: Record<string, string[]> = {
  'Noto Sans SC': ['Noto Sans CJK SC', '思源黑体'],
  'Qingsong Shouxie Ti Yi': ['轻松手写体一', '轻松手写体'],
  'Qingsong Shouxie Ti San P': ['轻松手写体三', '轻松手写体'],
  'Pangmen Zhengdao Biaoti Ti': ['庞门正道标题体', '庞门正道'],
  'Pangmen Zhengdao Qingsong Ti': ['庞门正道轻松体'],
  'Huxiaobo Nanshen Ti': ['胡晓波男神体'],
  'Huxiaobo Saobao Ti': ['胡晓波骚包体'],
  'Huxiaobo Zhenshuai Ti': ['胡晓波真帅体'],
  'Douyin Meihao Ti': ['抖音美好体'],
};

/** Google-hosted CJK fonts: English family name → its Chinese alias. */
export const ZH_GOOGLE_FONT_ALIASES: Record<string, string> = {
  'LXGW WenKai TC': '霞鹜文楷',
  'ZCOOL QingKe HuangYou': '站酷庆科黄油体',
};

/** Example Chinese font names used in the font tool's description. */
export const ZH_FONT_QUERY_EXAMPLES = ['思源黑体', '得意黑', '抖音美好体'] as const;
