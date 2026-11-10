import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export function validateCourse(course: unknown): asserts course is string {
  if (typeof course !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(course))
    throw new Error('Invalid course workspace.');
}

/** Paths are remembered only after a native folder dialog, never supplied by course content. */
export class CourseFolders {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}
  private async read(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new Error('Could not read saved course folders.');
    }
  }
  async get(course: string): Promise<string | null> {
    validateCourse(course);
    await this.queue;
    const entries = await this.read();
    const folder = Object.hasOwn(entries, course) ? entries[course] : null;
    if (!folder) return null;
    try {
      const resolved = await realpath(folder);
      if (!(await stat(resolved)).isDirectory()) throw new Error();
      return resolved;
    } catch {
      throw new Error(
        'The saved course folder is unavailable. Open another folder or reconnect its drive.',
      );
    }
  }
  set(course: string, folder: string): Promise<void> {
    validateCourse(course);
    const task = this.queue.then(async () => {
      const entries = await this.read();
      Object.defineProperty(entries, course, {
        value: await realpath(folder),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(entries), {
        mode: 0o600,
      });
      await rename(this.file + '.tmp', this.file);
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
