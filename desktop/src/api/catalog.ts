import type { CatalogResult, Course } from '../domain/catalog';
import { withDesktopHeaders } from './client-info';

export function backendBase(value = 'http://localhost:4000'): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  ) {
    throw new Error('Use an HTTPS backend address, or HTTP on localhost.');
  }
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      'Use the backend origin only, for example http://localhost:4000.',
    );
  return url.origin;
}

export function isCourse(value: unknown): value is Course {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    ['id', 'slug', 'title', 'category', 'pricingType', 'currency'].every(
      (key) => typeof c[key] === 'string',
    ) &&
    ['moduleCount', 'chapterCount', 'priceCents'].every(
      (key) => typeof c[key] === 'number' && Number.isFinite(c[key]),
    ) &&
    [
      'description',
      'coverUrl',
      'difficulty',
      'instructorName',
      'projectGoal',
    ].every((key) => c[key] === null || typeof c[key] === 'string') &&
    (c.estimatedHours === null || typeof c.estimatedHours === 'number')
  );
}

export async function fetchCatalog(
  base: string,
  request: typeof fetch = fetch,
): Promise<CatalogResult> {
  try {
    const response = await request(`${backendBase(base)}/api/v1/catalog`, {
      headers: withDesktopHeaders({ Accept: 'application/json' }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok)
      return {
        ok: false,
        message:
          response.status >= 500
            ? 'The course service is temporarily unavailable. Try again shortly.'
            : `Could not load courses (HTTP ${response.status}).`,
      };
    const body = await response.json();
    if (
      body.success !== true ||
      !Array.isArray(body.data?.courses) ||
      !body.data.courses.every(isCourse)
    ) {
      return {
        ok: false,
        message: 'The backend returned an unexpected course response.',
      };
    }
    return { ok: true, courses: body.data.courses };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'The course service took too long to respond. Please try again.'
          : 'Cannot connect to the course service. Check that the backend is running and BUILDMENT_API_URL is configured correctly.',
    };
  }
}
