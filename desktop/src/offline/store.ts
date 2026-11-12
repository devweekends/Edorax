import { app, safeStorage } from 'electron';
import { readFile, mkdir, rename, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { Course, CourseDetail } from '../domain/catalog';
import type { CourseOverview } from '../../../server/src/shared/api/catalog';
import type { BlockState, Lesson } from '../domain/learning';

export type SavedSession = { token: string; userId: string; expiresAt: string };
export type DownloadedCourse = {
  releaseId: string;
  downloadedAt: string;
  summary: Course;
  detail: CourseDetail;
  overview: CourseOverview;
  lessons: Record<string, Lesson>;
  blocks: Record<string, BlockState>;
};
type OfflineData = {
  version: 1;
  session: SavedSession | null;
  ownerId: string | null;
  courses: Record<string, DownloadedCourse>;
  pending: PendingChange[];
};
export type PendingChange =
  | { kind: 'log'; chapterId: string; answers: Record<string, string> }
  | { kind: 'checklist'; chapterId: string; item: string; checked: boolean }
  | { kind: 'complete'; chapterId: string };
let encryptionReady = false;

/** Asks Electron once, after startup, whether secure storage is available. */
export async function prepareEncryption(): Promise<void> {
  try {
    encryptionReady = Boolean(await safeStorage?.isAsyncEncryptionAvailable?.());
  } catch {
    encryptionReady = false;
  }
}

const empty = (): OfflineData => ({
  version: 1,
  session: null,
  ownerId: null,
  courses: {},
  pending: [],
});

export interface OfflineStorageDriver {
  available(): boolean;
  dataPath(): string;
  encrypt(plainText: string): Promise<Buffer>;
  decrypt(
    encrypted: Buffer,
  ): Promise<{ result: string; shouldReEncrypt?: boolean }>;
}

const defaultDriver: OfflineStorageDriver = {
  available() {
    return Boolean(
      encryptionReady &&
      (process.platform !== 'linux' ||
        typeof safeStorage.getSelectedStorageBackend !== 'function' ||
        safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    );
  },
  dataPath() {
    return path.join(app?.getPath?.('userData') ?? '', 'learner-offline.dat');
  },
  encrypt(text: string) {
    return safeStorage.encryptStringAsync(text);
  },
  decrypt(encrypted: Buffer) {
    return safeStorage.decryptStringAsync(encrypted);
  },
};

/** All learner data is encrypted by the OS credential store before it touches disk. */
export class OfflineStore {
  private data: OfflineData = empty();
  private writing: Promise<void> = Promise.resolve();
  private driverInstance: OfflineStorageDriver;

  constructor(driver?: OfflineStorageDriver) {
    this.driverInstance = driver ?? defaultDriver;
  }

  private file() {
    return this.driverInstance.dataPath();
  }

  available() {
    return this.driverInstance.available();
  }

  async open() {
    if (!this.available()) return;
    try {
      const encrypted = await readFile(this.file());
      const { result, shouldReEncrypt } =
        await this.driverInstance.decrypt(encrypted);
      const value: unknown = JSON.parse(result);
      if (
        value &&
        typeof value === 'object' &&
        (value as OfflineData).version === 1
      ) {
        this.data = value as OfflineData;
        this.data.ownerId ??= this.data.session?.userId ?? null;
        this.data.pending ??= [];
        if (shouldReEncrypt) await this.save();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('Could not read encrypted offline data:', error);
    }
    if (
      this.data.session &&
      Date.parse(this.data.session.expiresAt) <= Date.now()
    ) {
      this.data.session = null;
      await this.save();
    }
  }

  session() {
    const session = this.available() ? this.data.session : null;
    return session && Date.parse(session.expiresAt) > Date.now()
      ? session
      : null;
  }

  course(slug: string) {
    return this.session() ? this.data.courses[slug] : undefined;
  }

  courses() {
    return this.session() ? Object.values(this.data.courses) : [];
  }

  async setSession(value: SavedSession) {
    if (!this.available()) return;
    if (this.data.ownerId !== value.userId) {
      this.data.courses = {};
      this.data.pending = [];
    }
    this.data.ownerId = value.userId;
    this.data.session = value;
    await this.save();
  }

  async clear() {
    this.data = empty();
    if (this.available()) await this.save();
  }

  async expireSession() {
    this.data.session = null;
    if (this.available()) await this.save();
  }

  async setCourse(slug: string, course: DownloadedCourse) {
    if (!this.session())
      throw new Error('Sign in and enable secure storage to download courses.');
    const previousIds = new Set(
      Object.values(this.data.courses[slug]?.lessons ?? {}).map(
        (lesson) => lesson.chapter.id,
      ),
    );
    if (this.data.pending.some((change) => previousIds.has(change.chapterId)))
      throw new Error('Sync your offline changes before replacing this download.');
    this.data.courses[slug] = course;
    await this.save();
  }

  async removeCourse(slug: string) {
    const ids = new Set(
      Object.values(this.data.courses[slug]?.lessons ?? {}).map(
        (lesson) => lesson.chapter.id,
      ),
    );
    if (this.data.pending.some((change) => ids.has(change.chapterId)))
      throw new Error(
        'Sync your saved notes and checklist changes before removing this download.',
      );
    delete this.data.courses[slug];
    if (this.available()) await this.save();
  }

  pending() {
    return this.session() ? [...this.data.pending] : [];
  }

  hasChapter(chapterId: string) {
    return this.courses().some((course) =>
      Object.values(course.lessons).some(
        (lesson) => lesson.chapter.id === chapterId,
      ),
    );
  }

  async queue(change: PendingChange) {
    if (!this.hasChapter(change.chapterId))
      throw new Error('Download this lesson before saving offline.');
    // Keep every mutation in order. Coalescing an in-flight item can let the
    // sync worker remove a newer value that the server has never received.
    this.data.pending.push(change);
    for (const course of this.courses()) {
      const lesson = Object.values(course.lessons).find(
        (value) => value.chapter.id === change.chapterId,
      );
      if (!lesson?.content) continue;
      if (change.kind === 'log') {
        lesson.content.learningLogAnswers = {
          ...lesson.content.learningLogAnswers,
          ...change.answers,
        };
      } else {
        lesson.content.checklistState = {
          ...lesson.content.checklistState,
          [change.item]: change.checked,
        };
      }
    }
    await this.save();
  }

  /** Queue a change that does not touch downloaded lesson content (for example, completing a lesson). */
  async queueAction(change: PendingChange) {
    if (!this.session()) throw new Error('Sign in to save progress offline.');
    this.data.pending.push(change);
    await this.save();
  }

  async shiftPending() {
    this.data.pending.shift();
    await this.save();
  }

  private async save() {
    const content = JSON.stringify(this.data);
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        const file = this.file();
        await mkdir(path.dirname(file), { recursive: true });
        const encrypted = await this.driverInstance.encrypt(content);
        const temp = `${file}.tmp`;
        await writeFile(temp, encrypted, { mode: 0o600 });
        await chmod(temp, 0o600);
        await rename(temp, file);
      });
    await this.writing;
  }
}
