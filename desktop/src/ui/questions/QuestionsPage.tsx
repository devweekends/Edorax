import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, CircleHelp, Send } from 'lucide-react';
import type { HelpThreadDetail, HelpThreadSummary } from '../../../../server/src/shared/api/help';
import { timeAgo } from '../../domain/home';
import { ListSkeleton } from '../shared/Skeleton';

const BUTTON = 'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';

function label(value: string) {
  return value.replace(/_/g, ' ').toLowerCase();
}

function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-4xl px-8 py-8">
      <h1 className="font-heading text-4xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function QuestionsPage() {
  const [threads, setThreads] = useState<HelpThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await window.buildment.remote.request('/api/v1/help/threads', 'GET');
    if (result.ok) {
      setThreads((result.data as { threads: HelpThreadSummary[] }).threads);
      setError(null);
    } else {
      setError(result.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (openId) {
    return (
      <ThreadView
        threadId={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <Page title="Your questions" subtitle="Questions you asked from a lesson, and replies from your mentors.">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {threads === null && !error && <ListSkeleton rows={4} label="Loading questions" />}
      {threads && threads.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <h2 className="font-heading text-xl font-bold">No questions yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Ask a question from any chapter and it will show up here.</p>
        </div>
      )}
      <ul className="space-y-3">
        {threads?.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => setOpenId(thread.id)}
              className="flex w-full items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                <CircleHelp size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{thread.course.title}{thread.chapter ? ` · ${thread.chapter.title}` : ''}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold capitalize text-foreground">{label(thread.status)}</span>
                  {thread.unread && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">New reply</span>}
                </span>
                <span className="mt-1.5 block truncate font-semibold text-foreground">
                  {thread.question ?? (thread.kind === 'LESSON_REPORT' ? 'Lesson report' : 'Question')}
                </span>
                {thread.preview && (
                  <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                    {thread.preview.fromMentor ? 'Mentor: ' : ''}{thread.preview.body}
                  </span>
                )}
                <span className="mt-2 block text-xs text-muted-foreground">Updated {timeAgo(thread.updatedAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

function ThreadView({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const [thread, setThread] = useState<HelpThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const result = await window.buildment.remote.request(`/api/v1/help/threads/${threadId}`, 'GET');
    if (result.ok) setThread(result.data as HelpThreadDetail);
    else setError(result.message);
  }, [threadId]);

  useEffect(() => {
    void (async () => {
      await load();
      await window.buildment.remote.request(`/api/v1/help/threads/${threadId}/seen`, 'POST');
    })();
  }, [load, threadId]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await window.buildment.remote.request(`/api/v1/help/threads/${threadId}/messages`, 'POST', { body });
    setSending(false);
    if (result.ok) {
      setDraft('');
      void load();
    } else {
      setError(result.message);
    }
  }

  async function resolve() {
    const result = await window.buildment.remote.request(`/api/v1/help/threads/${threadId}/resolve`, 'POST');
    if (result.ok) void load();
    else setError(result.message);
  }

  return (
    <Page title={thread?.course.title ?? 'Question'} subtitle={thread?.chapter?.title}>
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> All questions
      </button>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {!thread && !error && <ListSkeleton rows={3} label="Loading question" />}
      {thread && (
        <>
          <ul className="space-y-3">
            {thread.messages.map((message) => {
              const mine = message.authorId === thread.menteeId;
              return (
                <li key={message.id} className={`max-w-[80%] rounded-2xl border border-border px-4 py-3 ${mine ? 'ml-auto bg-primary/10' : 'bg-card'}`}>
                  <p className="text-xs text-muted-foreground">
                    {mine ? 'You' : message.authorName} · {timeAgo(message.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
                </li>
              );
            })}
          </ul>
          {thread.status !== 'RESOLVED' && thread.status !== 'CLOSED' ? (
            <div className="mt-6 space-y-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Write a reply"
                className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => void resolve()} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                  Mark as resolved
                </button>
                <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className={`${BUTTON} inline-flex items-center gap-2`}>
                  <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">This thread is {label(thread.status)}.</p>
          )}
        </>
      )}
    </Page>
  );
}
