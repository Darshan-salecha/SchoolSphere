'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'offline';

/**
 * Subscribes to the live bus stream.
 *
 * Two things are tracked separately on purpose: whether the *connection* is
 * open, and when the last *message* arrived. Conflating them is a real bug —
 * a healthy transport is not proof that events are flowing, and a green "Live"
 * badge over a map that never moves is worse than an honest "reconnecting".
 * Consumers use `isStale` to fall back to polling instead of trusting the
 * connection state.
 */
export function useBusStream(url: string | null, handlers: Record<string, (data: unknown) => void>) {
  const [state, setState] = useState<StreamState>('connecting');
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;

  useEffect(() => {
    if (!url) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource(url, { withCredentials: true });

      source.onopen = () => {
        setState('live');
        setLastMessageAt(Date.now());
      };

      // EventSource has no wildcard listener, so each event is bound explicitly.
      for (const [event, handler] of Object.entries(handlerRef.current)) {
        source.addEventListener(event, (e) => {
          setLastMessageAt(Date.now());
          try {
            handler(JSON.parse((e as MessageEvent).data));
          } catch {
            // A malformed frame should not take the stream down.
          }
        });
      }
      source.addEventListener('ready', () => setLastMessageAt(Date.now()));

      source.onerror = () => {
        setState('reconnecting');
        source?.close();
        // EventSource reconnects on its own, but only for some failures; an
        // explicit retry covers the rest without a tight loop.
        if (!closed) retry = setTimeout(connect, 3_000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
      setState('offline');
    };
  }, [url]);

  return { state, lastMessageAt };
}

/**
 * True when the stream claims to be connected but has gone quiet for longer
 * than `silenceMs`. The timer only runs while it could change the answer.
 */
export function useIsStale(lastMessageAt: number | null, silenceMs: number, enabled = true) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!enabled || lastMessageAt === null) return;
    const remaining = silenceMs - (Date.now() - lastMessageAt);
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(1_000, remaining));
    return () => clearTimeout(timer);
  }, [lastMessageAt, silenceMs, enabled]);

  if (!enabled || lastMessageAt === null) return false;
  return Date.now() - lastMessageAt > silenceMs;
}

/** Polls a URL, used as the honest fallback when the stream goes quiet. */
export function usePoll<T>(url: string | null, intervalMs: number, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as T);
    } catch {
      // Offline; the next tick tries again.
    }
  }, [url]);

  useEffect(() => {
    if (!enabled || !url) return;
    void fetchOnce();
    const timer = setInterval(fetchOnce, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, url, intervalMs, fetchOnce]);

  return data;
}
