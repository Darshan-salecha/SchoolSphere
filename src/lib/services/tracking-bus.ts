import { TRACK_EVENTS } from '@/lib/tracking';

/**
 * In-process publish/subscribe for Server-Sent Events.
 *
 * One Node process holds every open parent stream in a Map keyed by channel.
 * That is exactly right for the single-container deployment this ships with,
 * and it is deliberately the *only* thing that would need replacing to scale
 * horizontally — swap this module for Redis pub/sub and nothing above it
 * changes, because publishers and subscribers only ever speak in channel names.
 *
 * Kept on globalThis so Next's dev-mode module reloading does not orphan live
 * subscribers behind a fresh module instance.
 */

export type BusMessage = { event: string; data: unknown };
type Subscriber = (message: BusMessage) => void;

const globalForBus = globalThis as unknown as { __ssTrackingBus?: Map<string, Set<Subscriber>> };
const channels = (globalForBus.__ssTrackingBus ??= new Map<string, Set<Subscriber>>());

export function subscribe(channel: string, subscriber: Subscriber): () => void {
  const set = channels.get(channel) ?? new Set<Subscriber>();
  set.add(subscriber);
  channels.set(channel, set);

  return () => {
    const current = channels.get(channel);
    if (!current) return;
    current.delete(subscriber);
    // Drop the channel entirely once nobody is listening, so a school with no
    // open parent tabs costs nothing.
    if (current.size === 0) channels.delete(channel);
  };
}

/** Fire-and-forget. A slow or broken subscriber can never fail a database write. */
export function publish(channel: string, event: string, data: unknown): number {
  const set = channels.get(channel);
  if (!set?.size) return 0;
  for (const subscriber of set) {
    try {
      subscriber({ event, data });
    } catch {
      // A dead stream is removed by its own cleanup; ignore it here.
    }
  }
  return set.size;
}

export const subscriberCount = (channel: string) => channels.get(channel)?.size ?? 0;

/** SSE frame. The comment line keeps proxies from idling the connection out. */
export function encodeSse(message: BusMessage): string {
  return `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
}

export const SSE_KEEPALIVE = `: keepalive\n\n`;
export { TRACK_EVENTS };
