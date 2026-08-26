import {
  LLM_PROVIDER_PRESETS,
  isLocalLlmProvider,
  llmProviderConfigNames,
} from '../../../shared/llm-providers';
import type { VendorId } from './vendorIcons';
import { secret, text, type SettingsVendorPage } from './settingsFields';

const llmPage = (preset: (typeof LLM_PROVIDER_PRESETS)[number]): SettingsVendorPage => {
  const names = llmProviderConfigNames(preset.id);
  return {
    key: `llm/${preset.id}`,
    vendor: preset.id as VendorId,
    title: preset.label,
    note: preset.id === 'anthropic'
      ? 'The built-in Agent requires an Anthropic API key. Claude Code subscription users should connect through “External agents (MCP)”; Aquarius Cut does not accept Claude OAuth.'
      : 'Each provider keeps its own endpoint, key, and model. Test the connection, then choose from the models returned by that API.',
    ...(preset.id === 'anthropic'
      ? { noteAction: { label: 'External agents (MCP)', action: 'open-mcp-guide' } }
      : {}),
    fields: [
      {
        name: names.baseUrl,
        label: 'API URL',
        kind: 'text',
        defaultLabel: preset.baseUrl,
        note: 'Enter the complete API prefix. You can use the official endpoint, your own gateway, or a compatible relay.',
      },
      secret(names.apiKey, isLocalLlmProvider(preset.id) ? 'API Key (optional)' : 'API Key'),
      ...(preset.id === 'openai' ? [{
        name: 'LLM_OPENAI_API_MODE',
        label: 'API format',
        kind: 'select' as const,
        defaultLabel: 'Responses API (recommended)',
        note: 'Choose the protocol your service actually supports. OpenAI uses the Responses API; compatible services use Chat Completions.',
        options: [{ value: 'chat', label: 'Chat Completions API' }],
      }] : []),
      {
        name: names.model,
        label: 'Model',
        kind: 'text',
        defaultLabel: preset.defaultModel,
        discoverableModel: true,
        note: 'After testing, choose a returned model or enter a model ID manually.',
        options: [{ value: preset.defaultModel, label: preset.defaultModel }],
      },
    ],
  };
};

const CODEX_PAGE: SettingsVendorPage = {
  key: 'llm/codex',
  vendor: 'openai',
  title: 'OpenAI · Codex',
  connection: 'codex',
  note: 'Sign in with a ChatGPT subscription. The official Codex CLI manages credentials, renewal, and logout; Aquarius Cut never reads or displays OAuth credentials.',
  fields: [
    {
      name: 'CODEX_MODEL', label: 'Codex model', kind: 'text',
      defaultLabel: 'Codex default model', discoverableModel: true,
      note: 'After signing in, load the models available to this account or enter a model ID manually.',
    },
    {
      name: 'CODEX_REASONING_EFFORT', label: 'Reasoning effort', kind: 'select',
      options: [{ value: '', label: 'Model default' }],
      note: 'Load models to see the effort levels supported by the current model. Leave this unset to use the model default.',
    },
  ],
};

const XAI_OAUTH_PAGE: SettingsVendorPage = {
  key: 'llm/xai-oauth', vendor: 'xai-oauth', title: 'xAI · Grok (Subscription sign-in)',
  connection: 'xai-oauth',
  note: 'Sign in with your SuperGrok or X Premium+ subscription: the official Grok CLI owns login and credentials (run grok login in a terminal); Aquarius Cut imports the session and refreshes it automatically, and never reads or displays OAuth credentials.',
  fields: [{
    name: 'LLM_XAI_OAUTH_MODEL', label: 'Model', kind: 'text', defaultLabel: 'grok-4.6',
    discoverableModel: true,
    note: 'After testing, choose a returned model or enter a model ID manually.',
    options: [{ value: 'grok-4.6', label: 'grok-4.6' }],
  }],
};

const AGENT_VENDOR_PAGES: readonly SettingsVendorPage[] = LLM_PROVIDER_PRESETS.flatMap((preset) => {
  if (preset.id === 'xai-oauth') return [XAI_OAUTH_PAGE];
  const page = llmPage(preset);
  return preset.id === 'openai' ? [page, CODEX_PAGE] : [page];
});

const VISION_PAGE: SettingsVendorPage = {
  key: 'llm/vision', vendor: 'vision', title: 'Vision understanding', fields: [],
};

export const PROXY_PAGE: SettingsVendorPage = {
  key: 'agent/proxy', vendor: 'proxy', title: 'Network proxy', kind: 'settings',
  note: 'If requests to overseas models (Gemini / OpenAI / Anthropic / Mistral, etc.) fail from '
    + 'behind a restrictive network, enter a local proxy address here (e.g. http://127.0.0.1:7890). '
    + 'Leave it blank to fall back to the system environment variables (HTTPS_PROXY / HTTP_PROXY). '
    + 'Applies to: Agent models, AI generation, model downloads, and R2 cloud sync.',
  fields: [text('PROXY_URL', 'Proxy URL', 'Example: http://127.0.0.1:7890')],
};

export const AGENT_VENDOR_PAGES_WITH_VISION: readonly SettingsVendorPage[] = [
  ...AGENT_VENDOR_PAGES,
  VISION_PAGE,
];
