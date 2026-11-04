import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { SubAgentChip } from './components/SubAgentChip';
import { SkillChip } from './components/SkillChip';
import { InputBar } from './components/InputBar';
import type { ModelOption } from './components/InputBar';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import { SubagentsModal } from './components/SubagentsModal';
import { SkillsModal } from './components/SkillsModal';
import { AgentInspectorDrawer } from './components/AgentInspectorDrawer';
import { ThinkingBlock } from './components/ThinkingBlock';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { ReportExportBar } from './components/ReportExportBar';
import { TelemetryHUD } from './components/TelemetryHUD';
import { DebateChatLog } from './components/DebateChatLog';
import { useResearchStream } from './hooks/useResearchStream';
import type {
  ResearchRun,
  ProviderConfig,
  ModelItem,
  AttachedFile,
  SubAgentEvent,
  SkillEvent,
  ResearchMode,
} from './types';
import { Sparkles, Layers, Sliders, Bot, Wand2, Copy, Check, Edit3 } from 'lucide-react';

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'auto/qwen', name: 'auto/qwen', provider: 'localhost', providerLabel: 'Localhost', tags: ['1M', 'Fast'] },
  { id: 'auto/coding', name: 'auto/coding', provider: 'localhost', providerLabel: 'Localhost', tags: ['Coding'] },
  { id: 'auto/fast', name: 'auto/fast', provider: 'localhost', providerLabel: 'Localhost', tags: ['Fast'] },
  { id: 'antigravity/gemini-3.8-flash-high', name: 'antigravity/gemini-3.8-flash-high', provider: 'localhost', providerLabel: 'Localhost', tags: ['1M', 'Vision'] },
  { id: 'antigravity/claude-sonnet-4-6', name: 'antigravity/claude-sonnet-4-6', provider: 'localhost', providerLabel: 'Localhost', tags: ['1M'] },
  { id: 'antigravity/claude-opus-4-6-thinking', name: 'antigravity/claude-opus-4-6-thinking', provider: 'localhost', providerLabel: 'Localhost', tags: ['Thinking'] },
];

export function App() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false); // Collapsed icon rail by default like Gemini
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isSubagentsOpen, setIsSubagentsOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [inspectedEvent, setInspectedEvent] = useState<SubAgentEvent | SkillEvent | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [editablePrompt, setEditablePrompt] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const [selectedModel, setSelectedModel] = useState('auto/qwen');
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>('localhost');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [runs, setRuns] = useState<ResearchRun[]>([]);

  const {
    isLoading,
    isThinking,
    isDebating,
    currentPrompt,
    currentRunId,
    timelineEvents,
    debateTurns,
    streamedContent,
    streamedThoughts,
    evidenceItems,
    error,
    telemetry,
    startStream,
    abortStream,
    resetChat,
    loadRunHistory,
  } = useResearchStream();

  const handleCitationClick = (citation: string, url?: string) => {
    setInspectedEvent(null);
    const match = citation.match(/\[(\d+)\]/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (evidenceItems[idx]) {
        setSelectedChunkId(evidenceItems[idx].chunk_id);
        setIsEvidenceOpen(true);
        return;
      }
    }
    if (url) {
      const matched = evidenceItems.find(
        (e) => e.url === url || (e.domain && url.includes(e.domain))
      );
      if (matched) {
        setSelectedChunkId(matched.chunk_id);
        setIsEvidenceOpen(true);
        return;
      }
    }
    setIsEvidenceOpen(true);
  };

  const fetchProvidersAndModels = async () => {
    try {
      const res = await fetch('/api/vault/providers');
      const data = await res.json();
      if (data.providers && Array.isArray(data.providers)) {
        const loadedModels: ModelOption[] = [];
        data.providers.forEach((prov: ProviderConfig) => {
          if (prov.is_enabled && prov.models) {
            prov.models.forEach((m: ModelItem) => {
              if (m.is_enabled !== false) {
                loadedModels.push({
                  id: m.id,
                  name: m.name || m.id,
                  provider: prov.provider,
                  providerLabel: prov.label || prov.provider,
                  tags: m.tags || [],
                });
              }
            });
          }
        });

        if (loadedModels.length > 0) {
          setAvailableModels(loadedModels);
          if (!loadedModels.some((m) => m.id === selectedModel)) {
            setSelectedModel(loadedModels[0].id);
            setSelectedProvider(loadedModels[0].provider);
          }
        }
      }

      // Fetch recent runs
      const runsRes = await fetch('/api/runs');
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        if (runsData.runs) setRuns(runsData.runs);
      }
    } catch (e) {
      console.error('Error fetching providers & models', e);
    }
  };

  useEffect(() => {
    fetchProvidersAndModels();
  }, []);

  const handleSuggestionClick = (prompt: string) => {
    setEditablePrompt(null);
    startStream(prompt, selectedModel, [], selectedProvider);
  };

  const handleModelChange = (model: string, provider?: string) => {
    setSelectedModel(model);
    setSelectedProvider(provider);
  };

  const handleDispatch = (
    prompt: string,
    model: string,
    files: AttachedFile[],
    provider?: string,
    mode?: ResearchMode
  ) => {
    setEditablePrompt(null);
    startStream(prompt, model, files, provider || selectedProvider, currentRunId, mode);
  };

  return (
    <div className="flex h-screen w-screen bg-[#131314] text-[#e3e3e3] overflow-hidden select-none font-sans">
      {/* 1. Left Gemini Rail / Drawer */}
      <Sidebar
        isExpanded={isSidebarExpanded}
        onToggle={() => setIsSidebarExpanded((prev) => !prev)}
        onNewChat={resetChat}
        onOpenVault={() => setIsVaultOpen(true)}
        onOpenSubagents={() => setIsSubagentsOpen(true)}
        onOpenSkills={() => setIsSkillsOpen(true)}
        onToggleEvidence={() => setIsEvidenceOpen((prev) => !prev)}
        runs={runs}
        onSelectRun={(run) => {
          loadRunHistory(run.id);
        }}
      />

      {/* 2. Main Workbench Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative ambient-glow">
        {/* Top Header */}
        <header className="h-12 border-b border-[#282a2c] px-4 flex items-center justify-between z-20 bg-[#131314]/60 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-medium text-white truncate max-w-md">
              {currentPrompt || 'Research Workbench'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1e1f20] text-[#8e918f] border border-[#3c4043]">
              SQLite FTS5
            </span>
          </div>

          <div className="flex items-center space-x-2.5 text-xs">
            {/* Subagents Button */}
            <button
              onClick={() => setIsSubagentsOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] border border-[#3c4043] text-zinc-300 hover:text-white transition-colors"
              title="Manage Subagents"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-medium">Subagents</span>
            </button>

            {/* Skills Button */}
            <button
              onClick={() => setIsSkillsOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] border border-[#3c4043] text-zinc-300 hover:text-white transition-colors"
              title="Manage Skills"
            >
              <Wand2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] font-medium">Skills</span>
            </button>

            {/* Model Settings Button */}
            <button
              onClick={() => setIsVaultOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] border border-[#3c4043] text-zinc-300 hover:text-white transition-colors"
              title="Open Model Settings"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-medium">Models</span>
            </button>

            {/* Endpoint Status Indicator */}
            <div className="flex items-center space-x-1.5 text-[#8e918f] px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono">ONLINE</span>
            </div>

            {/* Evidence Drawer Button */}
            <button
              onClick={() => setIsEvidenceOpen((prev) => !prev)}
              className="px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] text-xs text-[#8e918f] hover:text-white border border-[#3c4043] transition-colors flex items-center space-x-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-[#a8c7fa]" />
              <span>Evidence</span>
              {evidenceItems.length > 0 && (
                <span className="px-1.5 py-0.2 bg-[#a8c7fa] text-[#040e29] rounded-full text-[10px] font-bold">
                  {evidenceItems.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Dynamic Center Stage: Welcome Suggestions vs Chat Conversation */}
        <div className="flex-1 overflow-y-auto px-4 py-8 flex flex-col justify-between">
          {!currentPrompt && timelineEvents.length === 0 ? (
            /* Welcome Hero & Quick Starts */
            <div className="max-w-2xl mx-auto my-auto text-center space-y-6">
              <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-[#1e1f20] to-[#282a2c] border border-[#3c4043] shadow-lg">
                <Sparkles className="w-8 h-8 text-[#a8c7fa]" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-white tracking-tight">
                  Where research meets verified evidence
                </h1>
                <p className="text-sm text-[#8e918f] mt-2 max-w-lg mx-auto">
                  Deconstruct hypotheses, challenge biases with an adversarial skeptic, and index
                  verbatim evidence into SQLite FTS5 with zero vector database overhead.
                </p>
              </div>

              {/* Research Prompts Suggestions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 text-left">
                <button
                  onClick={() =>
                    handleSuggestionClick(
                      'Evaluate SQLite WAL mode concurrency guarantees for edge microservices'
                    )
                  }
                  className="px-3.5 py-2 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-xs text-[#e3e3e3] border border-[#3c4043] transition-all hover:scale-[1.02]"
                >
                  Evaluate SQLite WAL mode on edge devices
                </button>
                <button
                  onClick={() =>
                    handleSuggestionClick(
                      'Analyze FTS5 lexical BM25 retrieval vs Vector DB memory footprint'
                    )
                  }
                  className="px-3.5 py-2 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-xs text-[#e3e3e3] border border-[#3c4043] transition-all hover:scale-[1.02]"
                >
                  FTS5 BM25 vs Vector DB memory footprint
                </button>
                <button
                  onClick={() =>
                    handleSuggestionClick(
                      'Compare local Qwen/DeepSeek inference throughput with cloud APIs'
                    )
                  }
                  className="px-3.5 py-2 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-xs text-[#e3e3e3] border border-[#3c4043] transition-all hover:scale-[1.02]"
                >
                  Local model throughput vs Cloud APIs
                </button>
              </div>
            </div>
          ) : (
            /* Active Chat & Agent Stream */
            <div className="space-y-6 w-full max-w-3xl mx-auto pb-24">
              {/* User Prompt Bubble with Copy & Edit Quick Actions */}
              <div className="flex items-start justify-end group">
                <div className="relative max-w-xl bg-[#282a2c] text-white px-4 py-2.5 rounded-3xl text-sm leading-relaxed shadow-sm border border-[#3c4043]/50">
                  <div className="pr-14 break-words">{currentPrompt}</div>
                  <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPrompt) {
                          navigator.clipboard.writeText(currentPrompt);
                          setPromptCopied(true);
                          setTimeout(() => setPromptCopied(false), 2000);
                        }
                      }}
                      className="p-1 text-zinc-400 hover:text-white hover:bg-[#3c4043] rounded-full transition-colors"
                      title="Copy prompt"
                    >
                      {promptCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPrompt) {
                          setEditablePrompt(currentPrompt);
                        }
                      }}
                      className="p-1 text-zinc-400 hover:text-cyan-300 hover:bg-[#3c4043] rounded-full transition-colors"
                      title="Edit / re-run prompt"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Telemetry HUD */}
              {telemetry.status !== 'idle' && (
                <TelemetryHUD stats={telemetry} onAbort={abortStream} />
              )}

              {/* Agent Execution Flow */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-xs text-[#8e918f] pb-1">
                  <Sparkles className="w-4 h-4 text-[#a8c7fa]" />
                  <span className="font-medium tracking-wide">
                    RESEARCH PIPELINE TIMELINE (CLICK STEP TO INSPECT)
                  </span>
                </div>

                <div className="space-y-2 border-l border-[#282a2c] pl-4 ml-2">
                  {timelineEvents.map((evt, idx) => {
                    if (evt.type === 'subagent') {
                      return (
                        <SubAgentChip
                          key={idx}
                          event={evt}
                          onClick={() => {
                            setIsEvidenceOpen(false);
                            setInspectedEvent(evt);
                          }}
                        />
                      );
                    }
                    if (evt.type === 'skill') {
                      return (
                        <SkillChip
                          key={idx}
                          event={evt}
                          onClick={() => {
                            setIsEvidenceOpen(false);
                            setInspectedEvent(evt);
                          }}
                        />
                      );
                    }
                    if (evt.type === 'evidence') {
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setInspectedEvent(null);
                            setSelectedChunkId(evt.chunk_id);
                            setIsEvidenceOpen(true);
                          }}
                          className="p-3 bg-[#1e1f20] border border-[#3c4043] hover:border-cyan-400/60 rounded-xl text-xs space-y-1 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between text-[#8e918f]">
                            <span className="font-mono text-[10px] text-[#a8c7fa]">
                              EVIDENCE PROVENANCE
                            </span>
                            <span className="text-[10px]">{evt.domain}</span>
                          </div>
                          <p className="text-[#c4c7c5] italic">"{evt.snippet}"</p>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>

              {/* Multi-Agent Adversarial Debate Arena */}
              {(debateTurns.length > 0 || isDebating) && (
                <DebateChatLog debateTurns={debateTurns} isDebating={isDebating} />
              )}

              {/* Reliable Streaming Thinking Process Module */}
              <ThinkingBlock thoughts={streamedThoughts} isStreaming={isThinking} />

              {/* Real-time Synthesized Output */}
              {streamedContent && (
                  <div className="bg-[#1e1f20]/90 border border-[#3c4043] rounded-3xl p-6 shadow-xl relative backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-[#282a2c] pb-3 mb-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#a8c7fa]">
                        Synthesized Research Report
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#131314] text-[#8e918f] border border-[#3c4043]">
                        Model: {selectedModel}
                      </span>
                    </div>

                    <MarkdownRenderer
                      content={streamedContent}
                      onCitationClick={handleCitationClick}
                    />

                    {/* Multi-Format Export Engine */}
                    <ReportExportBar
                      runId={currentRunId}
                      content={streamedContent}
                      evidenceCount={evidenceItems.length}
                    />
                  </div>
              )}

              {/* Error Alert */}
              {error && (
                <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-2xl text-red-200 text-xs">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Bottom Input Bar with File Attachment, @ Mentions, and Model Selection */}
        <InputBar
          onDispatch={handleDispatch}
          isLoading={isLoading}
          onAbort={abortStream}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onToggleEvidence={() => {
            setInspectedEvent(null);
            setIsEvidenceOpen((prev) => !prev);
          }}
          availableModels={availableModels}
          parentRunId={currentRunId}
          externalPrompt={editablePrompt}
        />
      </main>

      {/* 4. Slide-out Evidence Drawer */}
      <EvidenceDrawer
        isOpen={isEvidenceOpen}
        onClose={() => setIsEvidenceOpen(false)}
        evidence={evidenceItems}
        selectedChunkId={selectedChunkId}
      />

      {/* 5. SubAgent / Skill Inspector Drawer */}
      <AgentInspectorDrawer
        isOpen={Boolean(inspectedEvent)}
        onClose={() => setInspectedEvent(null)}
        event={inspectedEvent}
      />

      {/* 6. Subagents Management Modal */}
      <SubagentsModal
        isOpen={isSubagentsOpen}
        onClose={() => setIsSubagentsOpen(false)}
      />

      {/* 7. Skills Management Modal */}
      <SkillsModal
        isOpen={isSkillsOpen}
        onClose={() => setIsSkillsOpen(false)}
      />

      {/* 8. Model Settings & BYOK Vault Modal */}
      <ModelSettingsModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onProvidersUpdated={fetchProvidersAndModels}
      />
    </div>
  );
}

export default App;
