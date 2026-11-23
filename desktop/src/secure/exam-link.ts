import { SECURE_DEEP_LINK_SCHEME } from '../../../server/src/shared/api/integrity';

// Kept free of Electron so it can be tested on its own.

export type ExamLaunch = {
  chapterId: string;
  token: string;
  courseSlug: string | null;
  chapterSlug: string | null;
};

const SLUG = /^[a-zA-Z0-9_-]{1,200}$/;

export function parseExamLink(url: string): ExamLaunch | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SECURE_DEEP_LINK_SCHEME}:` || parsed.hostname !== 'exam')
    return null;
  const chapterId = parsed.pathname.slice(1);
  const token = parsed.searchParams.get('token') ?? '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(chapterId) || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const course = parsed.searchParams.get('course') ?? '';
  const chapter = parsed.searchParams.get('chapter') ?? '';
  return {
    chapterId,
    token,
    courseSlug: SLUG.test(course) ? course : null,
    chapterSlug: SLUG.test(chapter) ? chapter : null,
  };
}
