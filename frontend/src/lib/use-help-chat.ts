"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRealtimeConnected, useRealtimeEvent } from "@/lib/realtime";
import type {
  HelpMessageReplyPreview,
  HelpMessageView,
  HelpThreadDetail,
} from "@/shared/api/help";
import type { Role } from "@/shared/domain/enums";

/** A chat message plus its local send state: pending (clock) or failed (retry); absent once saved. */
export type ChatMessage = HelpMessageView & {
  clientState?: "pending" | "failed";
  /** Stays the same when a sent message goes from placeholder to saved, so the bubble is not re-created (no flicker). */
  clientKey?: string;
};

// Only used when the live stream is down: how often to re-read the thread instead.
const FALLBACK_POLL_MS = 4_000;

type Scope = {
  extra: ChatMessage[];
  patches: Record<string, { deliveredAt?: string; seenAt?: string }>;
};
const EMPTY_SCOPE: Scope = { extra: [], patches: {} };
const NEW_THREAD_KEY = "__new__";

function newPendingId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  return `pending-${random}`;
}

function compare(a: ChatMessage, b: ChatMessage): number {
  // Unsent messages always sit at the bottom, in the order they were typed.
  if (Boolean(a.clientState) !== Boolean(b.clientState))
    return a.clientState ? 1 : -1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/**
 * Live view of one help thread. The page's server-rendered messages are the base;
 * messages pushed over the stream, optimistic sends and tick updates layer on top, so a
 * re-render with fresh props never loses them and never shows a message twice.
 *
 * While `active` (the chat is on screen) it also tells the server the incoming messages
 * were seen, which is what turns the other person's ticks blue.
 */
export function useHelpChat({
  threadId,
  serverMessages,
  viewerId,
  active,
}: {
  threadId: string | null;
  serverMessages: HelpMessageView[];
  viewerId: string;
  active: boolean;
}) {
  const key = threadId ?? NEW_THREAD_KEY;
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  const [tabVisible, setTabVisible] = useState(true);
  const connected = useRealtimeConnected();
  const seenInFlight = useRef(false);

  // Updates are keyed by thread so a slow reply to thread A can never land in thread B.
  const updateScope = useCallback(
    (scopeKey: string, change: (scope: Scope) => Scope) => {
      setScopes((all) => ({
        ...all,
        [scopeKey]: change(all[scopeKey] ?? EMPTY_SCOPE),
      }));
    },
    [],
  );

  const scope = scopes[key] ?? EMPTY_SCOPE;

  const messages = useMemo<ChatMessage[]>(() => {
    const byId = new Map<string, ChatMessage>();
    for (const message of serverMessages) byId.set(message.id, message);
    for (const message of scope.extra) {
      const saved = byId.get(message.id);
      byId.set(
        message.id,
        saved
          ? {
              ...saved,
              clientKey: message.clientKey,
              deliveredAt: saved.deliveredAt ?? message.deliveredAt,
              seenAt: saved.seenAt ?? message.seenAt,
            }
          : message,
      );
    }
    return [...byId.values()]
      .map((message) => {
        const patch = scope.patches[message.id];
        if (!patch) return message;
        return {
          ...message,
          deliveredAt: message.deliveredAt ?? patch.deliveredAt ?? null,
          seenAt: message.seenAt ?? patch.seenAt ?? null,
        };
      })
      .sort(compare);
  }, [serverMessages, scope]);

  const addIncoming = useCallback(
    (scopeKey: string, incoming: HelpMessageView[]) => {
      updateScope(scopeKey, (current) => {
        const byId = new Map(
          current.extra.map((message) => [message.id, message]),
        );
        for (const message of incoming) {
          const existing = byId.get(message.id);
          byId.set(
            message.id,
            existing
              ? {
                  ...message,
                  clientKey: existing.clientKey,
                  deliveredAt: message.deliveredAt ?? existing.deliveredAt,
                  seenAt: message.seenAt ?? existing.seenAt,
                }
              : message,
          );
        }
        return { ...current, extra: [...byId.values()] };
      });
    },
    [updateScope],
  );

  // --- live pushes -------------------------------------------------------------------

  useRealtimeEvent("help-message", (event) => {
    if (threadId && event.threadId === threadId)
      addIncoming(threadId, [event.message]);
  });

  useRealtimeEvent("help-status", (event) => {
    if (!threadId || event.threadId !== threadId) return;
    updateScope(threadId, (current) => {
      const patches = { ...current.patches };
      for (const id of event.messageIds) {
        patches[id] = {
          ...patches[id],
          ...(event.status === "seen"
            ? { deliveredAt: event.at, seenAt: event.at }
            : { deliveredAt: event.at }),
        };
      }
      return { ...current, patches };
    });
  });

  // --- stream is down: re-read the thread now and then, and once more when it comes back ---

  const refetch = useCallback(async () => {
    if (!threadId) return;
    try {
      const detail = await apiFetch<HelpThreadDetail>(
        `/api/v1/help/threads/${encodeURIComponent(threadId)}`,
      );
      addIncoming(threadId, detail.messages);
    } catch {
      // Try again on the next tick.
    }
  }, [threadId, addIncoming]);

  useEffect(() => {
    if (!threadId || !active) return;
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshes messages when the live connection changes
      void refetch();
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [threadId, active, connected, refetch]);

  // --- "seen": the chat is open and visible, so what the other side wrote has been read ---

  useEffect(() => {
    const onVisibility = () =>
      setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const unseenIncomingIds = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.authorId !== viewerId &&
            !message.seenAt &&
            !message.clientState,
        )
        .map((message) => message.id),
    [messages, viewerId],
  );
  const unseenKey = unseenIncomingIds.join(",");

  useEffect(() => {
    if (
      !threadId ||
      !active ||
      !tabVisible ||
      unseenKey === "" ||
      seenInFlight.current
    )
      return;
    seenInFlight.current = true;
    const ids = unseenKey.split(",");
    apiFetch(`/api/v1/help/threads/${encodeURIComponent(threadId)}/seen`, {
      method: "POST",
    })
      .then(() => {
        seenInFlight.current = false;
        const at = new Date().toISOString();
        updateScope(threadId, (current) => {
          const patches = { ...current.patches };
          for (const id of ids)
            patches[id] = { ...patches[id], deliveredAt: at, seenAt: at };
          return { ...current, patches };
        });
      })
      .catch(() => {
        // Not fatal: the next incoming message or tab focus tries again.
        seenInFlight.current = false;
      });
  }, [threadId, active, tabVisible, unseenKey, updateScope]);

  // --- sending (optimistic) ----------------------------------------------------------

  /** Shows the message instantly with a clock; the caller then sends it and settles or fails it. */
  const addPending = useCallback(
    (input: {
      body: string;
      role: Role;
      replyTo: HelpMessageReplyPreview | null;
    }): ChatMessage => {
      const pendingId = newPendingId();
      const pending: ChatMessage = {
        id: pendingId,
        clientKey: pendingId,
        body: input.body,
        createdAt: new Date().toISOString(),
        authorId: viewerId,
        authorName: "You",
        authorRole: input.role,
        replyTo: input.replyTo,
        deliveredAt: null,
        seenAt: null,
        clientState: "pending",
      };
      updateScope(key, (current) => ({
        ...current,
        extra: [...current.extra, pending],
      }));
      return pending;
    },
    [key, viewerId, updateScope],
  );

  const setPendingState = useCallback(
    (id: string, clientState: "pending" | "failed") => {
      updateScope(key, (current) => ({
        ...current,
        extra: current.extra.map((message) =>
          message.id === id ? { ...message, clientState } : message,
        ),
      }));
    },
    [key, updateScope],
  );

  /** The server saved it: swap the placeholder for the real message (single tick). */
  const settle = useCallback(
    (id: string, saved: HelpMessageView) => {
      updateScope(key, (current) => {
        const placeholder = current.extra.find((message) => message.id === id);
        return {
          ...current,
          extra: [
            ...current.extra.filter(
              (message) => message.id !== id && message.id !== saved.id,
            ),
            { ...saved, clientKey: placeholder?.clientKey ?? id },
          ],
        };
      });
    },
    [key, updateScope],
  );

  const discard = useCallback(
    (id: string) => {
      updateScope(key, (current) => ({
        ...current,
        extra: current.extra.filter((message) => message.id !== id),
      }));
    },
    [key, updateScope],
  );

  return { messages, connected, addPending, setPendingState, settle, discard };
}
