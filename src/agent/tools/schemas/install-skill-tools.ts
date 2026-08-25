import type { AgentToolSchema } from '../../tool-schema';


export const INSTALL_SKILL_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'install_skill',
    description: 'Installs a skill repo from GitHub into the local skills directory (~/.openchatcut/skills/<slug>/), pulling in the full SKILL.md plus its references/scripts/assets/examples. Once installed, it automatically shows up in the library\'s "Skills" panel, and can be activated with /skill:<slug> or from the panel. repo accepts a GitHub URL or owner/repo (e.g. "Jane-xiaoer/paper-collage-ad-codex"). slug is optional and defaults to the name from SKILL.md, or the repo name.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub repo: a full URL (https://github.com/owner/repo) or owner/repo' },
        slug: { type: 'string', description: 'Optional: install directory name (must be kebab-case); defaults to the SKILL.md frontmatter name, or the repo name' },
      },
      required: ['repo'],
    },
  },
];

export const INSTALL_SKILL_TOOL_NAMES = new Set(INSTALL_SKILL_TOOL_SCHEMAS.map((t) => t.name));
