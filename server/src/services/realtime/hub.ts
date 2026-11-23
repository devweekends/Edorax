import type { Response } from "express";
import type {
  RealtimeEventMap,
  RealtimeEventName,
} from "../../shared/api/realtime.js";

// In-memory registry of open Server-Sent-Event connections, keyed by user. A user can
// have several (tabs, devices). Like the rate limiter, this is per API process — fine
// for a single instance; put a pub/sub (e.g. Redis) behind publish() before scaling out.
const connections = new Map<string, Set<Response>>();

export function addConnection(userId: string, res: Response): void {
  const set = connections.get(userId) ?? new Set<Response>();
  set.add(res);
  connections.set(userId, set);
}

export function removeConnection(userId: string, res: Response): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(userId);
}

/** True while the user has at least one open stream — what "delivered" means in the chat. */
export function isOnline(userId: string): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
}

/** How many streams (browser tabs) the user has open right now. */
export function openConnectionCount(userId: string): number {
  return connections.get(userId)?.size ?? 0;
}

export function sendFrame(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The socket is already gone; the connection's close handler removes it.
  }
}

/** Push one event to every open stream of one user. A no-op when they are offline. */
export function publish<K extends RealtimeEventName>(
  userId: string,
  event: K,
  data: RealtimeEventMap[K],
): void {
  const set = connections.get(userId);
  if (!set) return;
  for (const res of set) sendFrame(res, event, data);
}
