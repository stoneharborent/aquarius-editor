import type { AgentToolSchema } from '../../tool-schema';
import { ZH_FONT_QUERY_EXAMPLES } from '../../../i18n/dict/zh/font-aliases';

export const FONT_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'search_fonts',
    description: [
      'Search the font catalog the local/headless renderer can load (Google Fonts bundled in-app',
      '+ locally bundled Chinese foundry faces, source:"bundled"). Use when export reports unsupported',
      'fonts or when picking fontFamily for motion-graphic items / captions. Returns canonical family',
      'names to use verbatim. Substring-matches family AND native-name aliases',
      `(case/punctuation-insensitive) — e.g. "inter", "playfair", "noto sc", ${ZH_FONT_QUERY_EXAMPLES.map((name) => `"${name}"`).join(', ')}.`,
      'loadable=false means catalogued only; prefer a loadable alternative or',
      'confirmFontFallback on export.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Substring to match against font family names or native-name aliases.',
        },
        projectId: {
          type: 'string',
          description: 'Ignored; the active project is used.',
        },
      },
      required: ['query'],
    },
  },
];

export const FONT_TOOL_NAMES = new Set(FONT_TOOL_SCHEMAS.map((t) => t.name));
