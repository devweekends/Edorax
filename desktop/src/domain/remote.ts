export const REMOTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Server routes the desktop app may call on the learner's behalf. Everything else is refused.
const ALLOWED_PREFIXES = [
  '/api/v1/help',
  '/api/v1/notifications',
  '/api/v1/learner/profile',
  '/api/v1/learner/weekly-goal',
  '/api/v1/learner/streak-popup',
  '/api/v1/learner/streak-milestones',
  '/api/v1/learner/ai-credential',
  '/api/v1/events',
];

export function isAllowedRemoteRequest(path: unknown, method: unknown): boolean {
  if (typeof path !== 'string' || typeof method !== 'string') return false;
  if (!(REMOTE_METHODS as readonly string[]).includes(method)) return false;
  const bare = path.split('?')[0] ?? '';
  if (!bare.startsWith('/') || bare.includes('..')) return false;
  return ALLOWED_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

// Web pages the desktop app may open in the browser: checkout, settings, notifications, questions.
const WEB_PATH = /^\/(courses\/[a-z0-9-]+\/checkout|settings|notifications|my-questions|help)(\/[A-Za-z0-9_-]+)*\/?$/;

export function isAllowedWebPath(path: unknown): boolean {
  return typeof path === 'string' && WEB_PATH.test(path);
}
