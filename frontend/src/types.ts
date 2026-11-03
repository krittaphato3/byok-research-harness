export interface ResearchRun {
  id: string;
  title: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  tokens_used?: number;
  estimated_cost?: number;
}

export interface ModelItem {
  id: string;
  name: string;
  tags?: string[];
  is_enabled: boolean;
}

export interface ProviderConfig {
  id: string;
  provider: string;
  label: string;
  base_url: string;
  api_format: string;
  key_hint: string;
  models: ModelItem[];
  is_enabled: number | boolean;
  is_default: number | boolean;
  last_test_status?: string | null;
  last_test_at?: string | null;
  updated_at?: string;
}

export interface VaultKey {
  id: string;
  provider: string;
  label: string;
  key_hint: string;
  is_enabled: number | boolean;
  is_default: number | boolean;
}

export interface PresetProvider {
  id: string;
  name: string;
  category: 'Zhipu' | 'Other';
  badge?: string;
  defaultBaseUrl: string;
  defaultFormat: string;
  models: string[];
  iconType: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  preview?: string;
}

export interface SubagentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
}

export interface AgentInspectorData {
  title: string;
  role: string;
  status: 'completed' | 'running' | 'failed';
  prompt: string;
  system_prompt?: string;
  thought: string;
  chat_dialogue?: SubagentChatMessage[];
  tools_called?: { name: string; args?: string; result?: string; status?: string }[];
  fetches: { type: string; detail: string }[];
  verdict: string;
}

export interface SkillInspectorData {
  title: string;
  name: string;
  status: 'completed' | 'running' | 'failed';
  description?: string;
  allowed_tools?: string;
  instructions?: string;
  query?: string;
  results?: { title: string; url: string; snippet: string }[];
  markdown_content?: string;
  url?: string;
  domain?: string;
  execution_log?: string;
}

export interface SubAgentEvent {
  type: 'subagent';
  name: string;
  action: string;
  role?: string;
  inspector?: AgentInspectorData;
}

export interface SkillEvent {
  type: 'skill';
  name: string;
  detail?: string;
  inspector?: SkillInspectorData;
}

export interface SubagentItem {
  id: string;
  name: string;
  description?: string;
  color: string;
  model: string;
  allowed_tools: string;
  system_prompt?: string;
  inject_agents_md: boolean | number;
  is_enabled: boolean | number;
}

export interface SkillItem {
  id: string;
  name: string;
  description?: string;
  allowed_tools: string;
  instructions?: string;
  is_enabled: boolean | number;
}

export interface EvidenceItem {
  chunk_id: string;
  domain: string;
  snippet: string;
  bm25_score?: number;
}

export type TimelineEvent =
  | SubAgentEvent
  | SkillEvent
  | { type: 'evidence'; chunk_id: string; domain: string; snippet: string }
  | { type: 'step'; role: string; message: string };
