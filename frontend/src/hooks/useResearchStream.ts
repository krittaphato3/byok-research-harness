import { useState, useCallback, useRef, useEffect } from 'react';
import type { TimelineEvent, EvidenceItem, AttachedFile, SubAgentEvent, SkillEvent } from '../types';

export function useResearchStream() {
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [streamedThoughts, setStreamedThoughts] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Smooth streaming token queue
  const contentQueueRef = useRef<string[]>([]);
  const thoughtQueueRef = useRef<string[]>([]);
  const animationFrameRef = useRef<number | null>(null);

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
      // Dynamically accelerate if queue grows large to prevent lag
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

  const enqueueContentToken = useCallback((delta: string) => {
    // Break into small character slices for ultra-fluid rendering
    const chars = delta.split('');
    contentQueueRef.current.push(...chars);
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(processSmoothQueue);
    }
  }, [processSmoothQueue]);

  const enqueueThoughtToken = useCallback((delta: string) => {
    const chars = delta.split('');
    thoughtQueueRef.current.push(...chars);
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(processSmoothQueue);
    }
  }, [processSmoothQueue]);

  const flushQueueImmediately = useCallback(() => {
    if (contentQueueRef.current.length > 0) {
      const remaining = contentQueueRef.current.join('');
      contentQueueRef.current = [];
      setStreamedContent((prev) => prev + remaining);
    }
    if (thoughtQueueRef.current.length > 0) {
      const remaining = thoughtQueueRef.current.join('');
      thoughtQueueRef.current = [];
      setStreamedThoughts((prev) => prev + remaining);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const startStream = useCallback(
    async (
      prompt: string,
      model: string,
      attachedFiles: AttachedFile[] = [],
      provider?: string
    ) => {
      flushQueueImmediately();
      setIsLoading(true);
      setIsThinking(true);
      setCurrentPrompt(prompt);
      setTimelineEvents([]);
      setStreamedContent('');
      setStreamedThoughts('');
      setError(null);

      try {
        // 1. Dispatch Run
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model,
            provider,
            context_files: attachedFiles.map((f) => f.name),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to create run');

        const runId = data.run_id;

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
                inspector: payload.inspector,
              };
              setTimelineEvents((prev) => [...prev, subEvent]);
            } else if (payload.type === 'skill') {
              const skillEvent: SkillEvent = {
                type: 'skill',
                name: payload.name,
                detail: payload.detail,
                inspector: payload.inspector,
              };
              setTimelineEvents((prev) => [...prev, skillEvent]);
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
              setEvidenceItems((prev) => [...prev, newItem]);
            } else if (payload.type === 'thought') {
              setIsThinking(true);
              enqueueThoughtToken(payload.delta);
            } else if (payload.type === 'token') {
              setIsThinking(false);
              enqueueContentToken(payload.delta);
            } else if (payload.type === 'done') {
              flushQueueImmediately();
              setIsLoading(false);
              setIsThinking(false);
              evtSource.close();
            } else if (payload.type === 'error') {
              flushQueueImmediately();
              setError(payload.message || 'Stream error');
              setIsLoading(false);
              setIsThinking(false);
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
          evtSource.close();
        };
      } catch (err: any) {
        setError(err.message || 'Network error');
        setIsLoading(false);
        setIsThinking(false);
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
    setTimelineEvents([]);
    setStreamedContent('');
    setStreamedThoughts('');
    setError(null);
    setIsLoading(false);
    setIsThinking(false);
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
        if (!data.ok) throw new Error(data.detail || 'Failed to load run history');

        setCurrentPrompt(data.run.prompt);
        setStreamedContent(data.report || '');
        setStreamedThoughts(data.thoughts || '');
        setTimelineEvents(data.events || []);
        setEvidenceItems(data.evidence || []);
      } catch (e: any) {
        setError(e.message || 'Error loading history run');
      } finally {
        setIsLoading(false);
        setIsThinking(false);
      }
    },
    [flushQueueImmediately]
  );

  return {
    isLoading,
    isThinking,
    currentPrompt,
    timelineEvents,
    streamedContent,
    streamedThoughts,
    evidenceItems,
    error,
    startStream,
    resetChat,
    loadRunHistory,
  };
}
