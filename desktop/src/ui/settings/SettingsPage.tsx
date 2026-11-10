import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { LearnerProfile } from '../../../../server/src/shared/api/learner';
import type { AiCredentialStatus } from '../../../../server/src/shared/api/ai';
import type { NotificationCategory, NotificationPreferences } from '../../../../server/src/shared/api/notifications';
import { FormSkeleton } from '../shared/Skeleton';
import { DotVoiceSwitch } from '../mascot/DotVoice';

type Tab = 'profile' | 'preferences' | 'notifications' | 'security';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
];

// Mirrors NOTIFICATION_CATEGORY_INFO on the server. Account and admin notices always arrive.
const CATEGORIES: { id: NotificationCategory; label: string; description: string; optional: boolean }[] = [
  { id: 'activity', label: 'Questions and reviews', description: 'Replies to your questions, mentor feedback, and work waiting for your review.', optional: true },
  { id: 'course', label: 'Courses', description: 'Enrollments, new learners, and finished courses.', optional: true },
  { id: 'reminder', label: 'Reminders', description: 'Study goal and streak reminders.', optional: true },
  { id: 'account', label: 'Account', description: 'Security and billing notices. These always arrive.', optional: false },
  { id: 'admin', label: 'Platform', description: 'Announcements from Edorax.', optional: false },
];

const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const BUTTON = 'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';
const GHOST = 'rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50';

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
}

function initialsOf(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email || '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function SettingsPage() {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [ai, setAi] = useState<AiCredentialStatus | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [skills, setSkills] = useState('');
  const [provider, setProvider] = useState<'OPENROUTER' | 'GEMINI'>('OPENROUTER');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshAi() {
    const result = await window.buildment.remote.request('/api/v1/learner/ai-credential', 'GET');
    if (result.ok) {
      const status = result.data as AiCredentialStatus;
      setAi(status);
      setProvider(status.provider);
      setModel(status.model ?? '');
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [profileResult] = await Promise.all([
        window.buildment.remote.request('/api/v1/learner/profile', 'GET'),
        refreshAi(),
      ]);
      if (!alive) return;
      if (profileResult.ok) {
        const data = profileResult.data as LearnerProfile;
        setProfile(data);
        setName(data.name ?? '');
        setTimezone(data.timezone);
        setSkills(data.skills.join(', '));
      } else {
        setError(profileResult.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'notifications' || prefs) return;
    void window.buildment.remote.request('/api/v1/notifications/preferences', 'GET').then((result) => {
      if (result.ok) setPrefs(result.data as NotificationPreferences);
      else setError(result.message);
    });
  }, [tab, prefs]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await window.buildment.remote.request('/api/v1/learner/profile', 'PATCH', {
      name: name.trim(),
      timezone: timezone.trim(),
      skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
    });
    setBusy(false);
    if (result.ok) {
      setProfile(result.data as LearnerProfile);
      setNotice('Profile saved.');
    } else {
      setError(result.message);
    }
  }

  async function saveKey(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await window.buildment.remote.request('/api/v1/learner/ai-credential', 'PUT', {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      setAi(result.data as AiCredentialStatus);
      setApiKey('');
      setNotice('AI key saved. It is used for your own drafts.');
    } else {
      setError(result.message);
    }
  }

  async function saveModel() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await window.buildment.remote.request('/api/v1/learner/ai-credential', 'PATCH', { model: model.trim() || null });
    setBusy(false);
    if (result.ok) {
      setAi(result.data as AiCredentialStatus);
      setNotice('Model saved.');
    } else {
      setError(result.message);
    }
  }

  async function testKey() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await window.buildment.remote.request('/api/v1/learner/ai-credential/test', 'POST');
    setBusy(false);
    if (result.ok) setNotice('Your AI key works.');
    else setError(result.message);
  }

  async function removeKey() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await window.buildment.remote.request('/api/v1/learner/ai-credential', 'DELETE');
    setBusy(false);
    if (result.ok) {
      setNotice('AI key deleted.');
      void refreshAi();
    } else {
      setError(result.message);
    }
  }

  async function setChannel(category: NotificationCategory, channel: 'inApp' | 'email', on: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [channel]: { ...prefs[channel], [category]: on } });
    setError(null);
    const result = await window.buildment.remote.request('/api/v1/notifications/preferences', 'PUT', { [channel]: { [category]: on } });
    if (result.ok) {
      setPrefs(result.data as NotificationPreferences);
    } else {
      setPrefs(previous);
      setError(result.message);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-8 px-8 py-8">
      {!profile && !error ? (
        <FormSkeleton />
      ) : (
        <header className="flex items-center gap-5">
          <span className="font-heading grid size-20 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-2xl font-bold text-secondary-foreground">
            {initialsOf(profile?.name, profile?.email)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Your account</p>
            <h1 className="font-heading truncate text-4xl font-bold tracking-tight">{profile?.name || 'Your name'}</h1>
            <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </header>
      )}

      <div role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {TABS.map((item) => {
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {notice && <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {tab === 'profile' && (
        <form onSubmit={saveProfile} className="space-y-5 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Profile</h2>
          <label className="block space-y-1.5 text-sm font-medium">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Email
            <input value={profile?.email ?? ''} disabled className={`${FIELD} opacity-60`} />
            <span className="block text-xs font-normal text-muted-foreground">Your sign-in email. Change it on the website.</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Timezone
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} list="tz-options" className={FIELD} />
            <datalist id="tz-options">
              {timezones().map((zone) => <option key={zone} value={zone} />)}
            </datalist>
            <span className="block text-xs font-normal text-muted-foreground">Study days and streaks use this timezone.</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Skills
            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, SQL, Python" className={FIELD} />
            <span className="block text-xs font-normal text-muted-foreground">Separate skills with commas.</span>
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={busy || !profile} className={BUTTON}>Save profile</button>
          </div>
        </form>
      )}

      {tab === 'preferences' && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
          <DotVoiceSwitch />
          <div>
            <h2 className="font-heading text-lg font-bold">AI interviews</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use guided written-answer feedback and practise interviews with your own provider key.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Cost:</span> interviews and written-answer checks run on your own OpenRouter account. A longer session may cost a few cents; provider pricing and free tiers apply.
            </p>
            <p className="mt-2 flex gap-2">
              <ShieldCheck size={16} className="mt-1 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground">Privacy:</span> your key is encrypted before it is saved and is only used for your AI learning activities. It is never shown again, only its last four characters. Your answers go to OpenRouter and the model you pick, and your mentor can read finished submissions. You can delete the key at any time.
              </span>
            </p>
          </div>
          {!ai && <FormSkeleton />}
          {ai && !ai.configured && <p className="text-sm text-muted-foreground">AI keys are not enabled on this server yet.</p>}
          {ai?.configured && (
            <>
              <p className="text-sm">{ai.hasKey ? `Key saved${ai.lastFour ? ` (ending ${ai.lastFour})` : ''}.` : 'No key saved.'}</p>
              <form onSubmit={saveKey} className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium">
                  AI provider
                  <select value={provider} onChange={(e) => setProvider(e.target.value as 'OPENROUTER' | 'GEMINI')} className={FIELD}>
                    <option value="OPENROUTER">OpenRouter</option>
                    <option value="GEMINI">Gemini</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  {provider === 'GEMINI' ? 'Gemini key' : 'OpenRouter key'}
                  <input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={ai.hasKey ? 'Enter a new key to replace' : 'sk-or-v1-...'}
                    className={FIELD}
                  />
                  {provider === 'OPENROUTER' && (
                    <span className="block text-xs font-normal text-muted-foreground">Create one at openrouter.ai/keys. We verify it before saving.</span>
                  )}
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  Model
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={ai.defaultModel} className={FIELD} />
                  <span className="block text-xs font-normal text-muted-foreground">
                    Leave empty to use {ai.defaultModel}. Enter a model id supported by {provider === 'GEMINI' ? 'Gemini' : 'OpenRouter'}.
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={busy || !apiKey.trim()} className={BUTTON}>Save and test key</button>
                  {ai.hasKey && <button type="button" onClick={() => void saveModel()} disabled={busy} className={GHOST}>Save model</button>}
                  {ai.hasKey && <button type="button" onClick={() => void testKey()} disabled={busy} className={GHOST}>Test key</button>}
                  {ai.hasKey && <button type="button" onClick={() => void removeKey()} disabled={busy} className={GHOST}>Delete key</button>}
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-heading text-lg font-bold">Notifications</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose what reaches you in the app and by email.</p>
          </div>
          {!prefs ? (
            <div className="p-6"><FormSkeleton /></div>
          ) : (
            <ul className="divide-y divide-border">
              {CATEGORIES.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{category.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <Channel label="In app" on={prefs.inApp[category.id]} disabled={!category.optional} onChange={(on) => void setChannel(category.id, 'inApp', on)} />
                    <Channel label="Email" on={prefs.email[category.id]} disabled={!category.optional} onChange={(on) => void setChannel(category.id, 'email', on)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Security</h2>
          <p className="text-sm text-muted-foreground">Password, sign-in methods and active sessions are managed on the Edorax website.</p>
          <button type="button" onClick={() => void window.buildment.openWeb('/settings/profile')} className={`${GHOST} inline-flex items-center gap-2`}>
            <ExternalLink size={14} /> Open security settings on the website
          </button>
        </div>
      )}
    </section>
  );
}

function Channel({ label, on, disabled, onChange }: { label: string; on: boolean; disabled: boolean; onChange: (on: boolean) => void }): ReactNode {
  return (
    <label className="flex items-center gap-2 text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
