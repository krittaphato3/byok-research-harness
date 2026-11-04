import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  TimelineEvent,
  EvidenceItem,
  AttachedFile,
  SubAgentEvent,
  SkillEvent,
  DebateMessage,
  ResearchMode,
} from '../types';
import type { TelemetryStats } from '../components/TelemetryHUD';

export function useResearchStream() {
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isDebating, setIsDebating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [debateTurns, setDebateTurns] = useState<DebateMessage[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [streamedThoughts, setStreamedThoughts] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetryStats>({
    stage: '',
    tokensUsed: 0,
    tokensPerSec: 0,
    elapsedSeconds: 0,
    sourcesCount: 0,
    chunksCount: 0,
    status: 'idle',
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const runStartTimeRef = useRef<number>(0);
  const generationStartTimeRef = useRef<number>(0);
  const tokenCountRef = useRef<number>(0);

  // Smooth streaming token queue
  const contentQueueRef = useRef<string[]>([]);
  const thoughtQueueRef = useRef<string[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Active elapsed timer
  useEffect(() => {
    let timer: any = null;
    if (isLoading) {
      timer = setInterval(() => {
        if (runStartTimeRef.current > 0) {
          const elapsed = (Date.now() - runStartTimeRef.current) / 1000;
          setTelemetry((prev) => {
            const activeGenSecs = generationStartTimeRef.current > 0 ? (Date.now() - generationStartTimeRef.current) / 1000 : 0;
            const tps = activeGenSecs > 0.5
              ? Math.round((prev.tokensUsed / activeGenSecs) * 10) / 10
              : (elapsed > 0 ? Math.round((prev.tokensUsed / elapsed) * 10) / 10 : 0);
            return {
              ...prev,
              elapsedSeconds: elapsed,
              tokensPerSec: tps,
            };
          });
        }
      }, 300);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading]);

  const processSmoothQueue = useCallback(() => {
    let hasMore = false;

    // 1. Drain thoughts smoothly
    if (thoughtQueueRef.current.length > 0) {
      hasMore = true;
      const count = Math.max(1, Math.min(3, Math.ceil(thoughtQueueRef.current.length / 5)));
      const chunk = thoughtQueueRef.current.splice(0, count).join('');
      setStreamedThoughts((prev) => prev + chunk);
    }

    // 2. Drain content tokens smoothly
    if (contentQueueRef.current.length > 0) {
      hasMore = true;
      const count = Math.max(1, Math.min(4, Math.ceil(contentQueueRef.current.length / 4)));
      const chunk = contentQueueRef.current.splice(0, count).join('');
      setStreamedContent((prev) => prev + chunk);
    }

    if (hasMore) {
      animationFrameRef.current = requestAnimationFrame(processSmoothQueue);
    } else {
      animationFrameRef.current = null;
    }
  }, []);

  const enqueueContentToken = useCallback(
    (delta: string) => {
      contentQueueRef.current.push(delta);
      tokenCountRef.current += 1;
      setTelemetry((prev) => ({
        ...prev,
        tokensUsed: prev.tokensUsed + 1,
      }));
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(processSmoothQueue);
      }
    },
    [processSmoothQueue]
  );

  const enqueueThoughtToken = useCallback(
    (delta: string) => {
      thoughtQueueRef.current.push(delta);
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(processSmoothQueue);
      }
    },
    [processSmoothQueue]
  );

  const flushQueueImmediately = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (thoughtQueueRef.current.length > 0) {
      setStreamedThoughts((prev) => prev + thoughtQueueRef.current.join(''));
      thoughtQueueRef.current = [];
    }
    if (contentQueueRef.current.length > 0) {
      setStreamedContent((prev) => prev + contentQueueRef.current.join(''));
      contentQueueRef.current = [];
    }
  }, []);

  const abortStream = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    flushQueueImmediately();
    setIsLoading(false);
    setIsThinking(false);
    setTelemetry((prev) => ({
      ...prev,
      status: 'aborted',
      stage: 'Aborted by user',
    }));

    if (currentRunId) {
      try {
        await fetch(`/api/runs/${currentRunId}/abort`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to notify server of run cancellation:', err);
      }
    }
  }, [currentRunId, flushQueueImmediately]);

  const startStream = useCallback(
    async (
      prompt: string,
      model: string,
      attachedFiles: AttachedFile[] = [],
      provider?: string,
      parentRunId?: string | null,
      mode: ResearchMode = 'deep_research'
    ) => {
      setIsLoading(true);
      setIsThinking(false);
      setIsDebating(false);
      setCurrentPrompt(prompt);
      setTimelineEvents([]);
      setDebateTurns([]);
      setEvidenceItems([]);
      setStreamedContent('');
      setStreamedThoughts('');
      setError(null);

      runStartTimeRef.current = Date.now();
      generationStartTimeRef.current = 0;
      tokenCountRef.current = 0;

      const initialStage =
        mode === 'fast'
          ? 'Fast Direct Synthesis'
          : mode === 'debate'
          ? 'Adversarial Court Debate Arena'
          : 'Formulating Research Plan';

      setTelemetry({
        stage: initialStage,
        tokensUsed: 0,
        tokensPerSec: 0,
        elapsedSeconds: 0,
        sourcesCount: 0,
        chunksCount: 0,
        status: 'running',
      });

      try {
        // 1. Dispatch Run
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model,
            provider,
            mode,
            context_files: attachedFiles.map((f) => f.name),
            parent_run_id: parentRunId || undefined,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to create run');

        const runId = data.run_id;
        setCurrentRunId(runId);

        // Update URL path to match Gemini format: /app/<chat_id>
        const cleanId = runId.replace(/^run_/, '');
        const targetPath = `/app/${cleanId}`;
        if (window.location.pathname !== targetPath) {
          window.history.pushState({ cid: runId }, '', targetPath);
        }

        // 2. Open SSE stream
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const queryParams = new URLSearchParams({ model });
        if (provider) queryParams.set('provider', provider);

        const evtSource = new EventSource(
          `/api/runs/${runId}/stream?${queryParams.toString()}`
        );
        eventSourceRef.current = evtSource;

        evtSource.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);

            if (payload.type === 'subagent') {
              const subEvent: SubAgentEvent = {
                type: 'subagent',
                name: payload.name,
                action: payload.action,
                role: payload.role,
                color: payload.color,
                inspector: payload.inspector,
              };
              setTimelineEvents((prev) => [...prev, subEvent]);
              setTelemetry((prev) => ({
                ...prev,
                stage: `${payload.role || payload.name}: ${payload.action}`,
              }));
            } else if (payload.type === 'skill') {
              const skillEvent: SkillEvent = {
                type: 'skill',
                name: payload.name,
                detail: payload.detail,
                inspector: payload.inspector,
              };
              setTimelineEvents((prev) => [...prev, skillEvent]);
              setTelemetry((prev) => ({
                ...prev,
                stage: `Skill: ${payload.name} (${payload.detail || 'active'})`,
              }));
            } else if (payload.type === 'evidence') {
              setTimelineEvents((prev) => [
                ...prev,
                {
                  type: 'evidence',
                  chunk_id: payload.chunk_id,
                  domain: payload.domain,
                  snippet: payload.snippet,
                },
              ]);
              const newItem: EvidenceItem = {
                chunk_id: payload.chunk_id,
                domain: payload.domain,
                snippet: payload.snippet,
                bm25_score: 0.96,
              };
              setEvidenceItems((prev) => {
                const next = [...prev, newItem];
                setTelemetry((t) => ({
                  ...t,
                  sourcesCount: new Set(next.map((n) => n.domain)).size,
                  chunksCount: next.length,
                }));
                return next;
              });
            } else if (payload.type === 'debate_start_turn') {
              setIsDebating(true);
              const newTurn: DebateMessage = {
                id: payload.id,
                round: payload.round,
                speaker: payload.speaker,
                speakerName: payload.speakerName,
                speakerRole: payload.speakerRole,
                avatarColor: payload.avatarColor || '#38bdf8',
                content: '',
                timestamp: payload.timestamp || '',
                status: 'streaming',
              };
              setDebateTurns((prev) => [...prev, newTurn]);
              setTelemetry((prev) => ({
                ...prev,
                stage: `Debate Round ${payload.round}: ${payload.speakerName}`,
              }));
            } else if (payload.type === 'debate_token') {
              setDebateTurns((prev) =>
                prev.map((t) => (t.id === payload.id ? { ...t, content: t.content + payload.delta } : t))
              );
            } else if (payload.type === 'debate_turn') {
              setIsDebating(false);
              setDebateTurns((prev) => {
                const existing = prev.find((t) => t.id === payload.id);
                if (existing) {
                  return prev.map((t) =>
                    t.id === payload.id ? { ...t, content: payload.content, status: 'completed' } : t
                  );
                } else {
                  return [
                    ...prev,
                    {
                      id: payload.id,
                      round: payload.round,
                      speaker: payload.speaker,
                      speakerName: payload.speakerName,
                      speakerRole: payload.speakerRole,
                      avatarColor: payload.avatarColor || '#38bdf8',
                      content: payload.content,
                      timestamp: payload.timestamp || '',
                      status: 'completed',
                    },
                  ];
                }
              });
            } else if (payload.type === 'thought') {
              setIsThinking(true);
              enqueueThoughtToken(payload.delta);
            } else if (payload.type === 'token') {
              if (generationStartTimeRef.current === 0) {
                generationStartTimeRef.current = Date.now();
              }
              setIsThinking(false);
              setIsDebating(false);
              enqueueContentToken(payload.delta);
              setTelemetry((prev) => ({
                ...prev,
                stage: 'Editor: Synthesizing verified claims',
              }));
            } else if (payload.type === 'status' && payload.status === 'aborted') {
              flushQueueImmediately();
              setIsLoading(false);
              setIsThinking(false);
              setTelemetry((prev) => ({
                ...prev,
                status: 'aborted',
                stage: 'Research aborted',
              }));
              evtSource.close();
            } else if (payload.type === 'done') {
              flushQueueImmediately();
              setIsLoading(false);
              setIsThinking(false);
              setTelemetry((prev) => ({
                ...prev,
                status: 'completed',
                stage: 'Research completed',
              }));
              evtSource.close();
            } else if (payload.type === 'error') {
              flushQueueImmediately();
              setError(payload.message || 'Stream error');
              setIsLoading(false);
              setIsThinking(false);
              setTelemetry((prev) => ({
                ...prev,
                status: 'failed',
                stage: 'Error encountered',
              }));
              evtSource.close();
            }
          } catch (err) {
            console.error('SSE JSON parse error:', err);
          }
        };

        evtSource.onerror = () => {
          flushQueueImmediately();
          setIsLoading(false);
          setIsThinking(false);
          setTelemetry((prev) => ({
            ...prev,
            status: prev.status === 'running' ? 'completed' : prev.status,
          }));
          evtSource.close();
        };
      } catch (err: any) {
        setError(err.message || 'Network error');
        setIsLoading(false);
        setIsThinking(false);
        setTelemetry((prev) => ({
          ...prev,
          status: 'failed',
          stage: err.message || 'Failed',
        }));
      }
    },
    [enqueueContentToken, enqueueThoughtToken, flushQueueImmediately]
  );

  const resetChat = useCallback(() => {
    flushQueueImmediately();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setCurrentPrompt(null);
    setCurrentRunId(null);
    setTimelineEvents([]);
    setDebateTurns([]);
    setIsDebating(false);
    setStreamedContent('');
    setStreamedThoughts('');
    setEvidenceItems([]);
    setError(null);
    setTelemetry({
      stage: '',
      tokensUsed: 0,
      tokensPerSec: 0,
      elapsedSeconds: 0,
      sourcesCount: 0,
      chunksCount: 0,
      status: 'idle',
    });
    if (window.location.pathname !== '/app' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/app');
    }
  }, [flushQueueImmediately]);

  const loadRunHistory = useCallback(
    async (runId: string) => {
      flushQueueImmediately();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/runs/${runId}`);
        const data = await res.json();
        if (data.ok) {
          const canonicalId = data.run.id;
          setCurrentPrompt(data.run.prompt);
          setCurrentRunId(canonicalId);
          setStreamedContent(data.report || '');
          setStreamedThoughts(data.thoughts || '');
          setEvidenceItems(data.evidence || []);

          // Sync URL to /app/<chat_id> like Gemini
          const cleanId = canonicalId.replace(/^run_/, '');
          const targetPath = `/app/${cleanId}`;
          if (window.location.pathname !== targetPath) {
            window.history.replaceState({ cid: canonicalId }, '', targetPath);
          }

          const loadedEvents: TimelineEvent[] = [];
          if (data.events && Array.isArray(data.events)) {
            for (const ev of data.events) {
              if (ev.event_type === 'subagent') {
                loadedEvents.push({
                  type: 'subagent',
                  name: ev.payload.name,
                  action: ev.payload.action,
                  role: ev.payload.role,
                  color: ev.payload.color,
                  inspector: ev.payload.inspector,
                });
              } else if (ev.event_type === 'skill') {
                loadedEvents.push({
                  type: 'skill',
                  name: ev.payload.name,
                  detail: ev.payload.detail,
                  inspector: ev.payload.inspector,
                });
              } else if (ev.event_type === 'evidence') {
                loadedEvents.push({
                  type: 'evidence',
                  chunk_id: ev.payload.chunk_id,
                  domain: ev.payload.domain,
                  snippet: ev.payload.snippet,
                });
              }
            }
          }
          setTimelineEvents(loadedEvents);
          if (data.debate && Array.isArray(data.debate)) {
            setDebateTurns(data.debate);
          } else {
            setDebateTurns([]);
          }

          const charLen = (data.report || '').length;
          setTelemetry({
            stage: 'Archived Dossier Loaded',
            tokensUsed: Math.round(charLen / 4),
            tokensPerSec: 0,
            elapsedSeconds: 0,
            sourcesCount: (data.evidence || []).length,
            chunksCount: (data.evidence || []).length,
            status: 'completed',
          });
        } else {
          throw new Error(data.detail || 'Chat session not found');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load run history');
        if (window.location.pathname.startsWith('/app/')) {
          window.history.replaceState({}, '', '/app');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [flushQueueImmediately]
  );

  return {
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
  };
}
