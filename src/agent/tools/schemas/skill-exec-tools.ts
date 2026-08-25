import type { AgentToolSchema } from '../../tool-schema';

export const RUN_SKILL_SCRIPT_TOOL_NAMES = new Set(['run_skill_script']);

export const RUN_SKILL_SCRIPT_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'run_skill_script',
    description: 'Runs a script from an installed skill directory locally (whitelisted commands: bash/sh/node/npm/npx/python3/python/uv/uvx/ffmpeg/ffprobe/mkdir/cp/chmod), with the working directory locked to the skill directory. Use it to run deterministic scripts bundled with a skill (e.g. render.mjs, check-deps.sh) — the cloud sandbox cannot access local skill files. Timeout defaults to 60s, capped at 120s; output capped at 512KB.',
    input_schema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill slug (the skill field returned by load_skill)' },
        command: { type: 'string', description: 'Command (the first word must be a whitelisted executable), e.g. bash scripts/check-deps.sh or node scripts/render.mjs' },
        timeout: { type: 'number', description: 'Optional: timeout in milliseconds, defaults to 60000, capped at 120000' },
      },
      required: ['skill', 'command'],
    },
  },
];
