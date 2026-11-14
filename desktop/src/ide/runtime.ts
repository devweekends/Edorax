import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { access, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IDESession } from '../domain/ide';

/** One local IDE per desktop app. The Node runtime is bundled, not taken from PATH. */
export class TheiaRuntime {
  private child?: ChildProcess;
  private session: IDESession | null = null;
  private starting = false;
  private token = '';
  authentication() {
    return this.token;
  }
  constructor(
    private readonly directory: string,
    private readonly dataDirectory: string,
  ) {}
  status() {
    return this.session;
  }
  async start(folder: string, parentOrigin: string): Promise<IDESession> {
    if (this.starting) throw new Error('The workspace is already starting.');
    const root = await realpath(folder);
    if (this.session?.folder === root) return this.session;
    const bundledNode = path.join(
      this.directory,
      'node_modules/node/bin',
      process.platform === 'win32' ? 'node.exe' : 'node',
    );
    const nodeBundled = await access(bundledNode).then(
      () => true,
      () => false,
    );
    // Use the bundled Node when it is installed, otherwise the Node already on this PC.
    const node = nodeBundled
      ? bundledNode
      : process.platform === 'win32'
        ? 'node.exe'
        : 'node';
    // The production build bundles the backend into lib/backend/main.js, which runs without
    // node_modules. src-gen/backend/main.js is the unbundled entry and needs ide/node_modules.
    const bundledMain = path.join(this.directory, 'lib/backend/main.js');
    const sourceMain = path.join(this.directory, 'src-gen/backend/main.js');
    const main = await access(bundledMain).then(
      () => bundledMain,
      () => sourceMain,
    );
    try {
      await access(main);
    } catch {
      throw new Error(
        'Theia is not built yet. Run npm --prefix desktop run ide:setup, then reopen the workspace.',
      );
    }
    this.starting = true;
    try {
      await this.stop();
      const config = path.join(
        this.dataDirectory,
        createHash('sha256').update(root).digest('hex').slice(0, 16),
      );
      const userPlugins = path.join(this.dataDirectory, 'plugins');
      const bundledPlugins = path.join(this.directory, 'plugins');
      await mkdir(config, { recursive: true });
      await mkdir(userPlugins, { recursive: true });
      await mkdir(bundledPlugins, { recursive: true });
      await writeFile(
        path.join(config, 'recentworkspace.json'),
        JSON.stringify({ recentRoots: [pathToFileURL(root).href] }),
      ).catch(() => {});
      const token = randomBytes(32).toString('hex');
      this.token = token;

      // Clean environment so child terminals don't inherit npm script variables like npm_config_prefix which breaks nvm
      const env: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.toLowerCase().startsWith('npm_')) {
          env[key] = value;
        }
      }

      // Ensure PATH includes the bundled Node runtime directory as well as standard system paths
      const nodeBinDir = nodeBundled ? path.dirname(bundledNode) : '';
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const existingPath = env.PATH || env.Path || '';
      const parts = existingPath.split(pathSeparator).filter(Boolean);
      const extras = [
        ...(nodeBinDir ? [nodeBinDir] : []),
        ...(process.platform === 'darwin'
          ? [
              '/opt/homebrew/bin',
              '/usr/local/bin',
              '/usr/bin',
              '/bin',
              '/usr/sbin',
              '/sbin',
            ]
          : []),
      ];
      for (const extra of extras) {
        if (!parts.includes(extra)) {
          parts.push(extra);
        }
      }
      env.PATH = parts.join(pathSeparator);
      if (process.platform === 'win32') {
        env.Path = env.PATH;
      }

      const defaultPlugins = `local-dir:${bundledPlugins},local-dir:${userPlugins}`;
      const child = spawn(
        node,
        [
          main,
          root,
          `--root-dir=${root}`,
          '--hostname=127.0.0.1',
          '--port=0',
          `--plugins=${defaultPlugins}`,
        ],
        {
          cwd: this.directory,
          env: {
            ...env,
            THEIA_PARENT_PID: String(process.pid),
            THEIA_CONFIG_DIR: config,
            THEIA_DEFAULT_PLUGINS: defaultPlugins,
            THEIA_PLUGINS: defaultPlugins,
            VSX_REGISTRY_URL: 'https://open-vsx.org',
            EDORAX_IDE_TOKEN: token,
            EDORAX_PARENT_ORIGIN: parentOrigin,
            EDORAX_WORKSPACE: root,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      this.child = child;
      child.once('exit', () => {
        if (this.child === child) {
          this.child = undefined;
          this.session = null;
        }
      });
      const port = await new Promise<number>((resolve, reject) => {
        let stdout = '';
        let diagnostic = '';
        const timer = setTimeout(
          () =>
            finish(
              new Error(
                'Theia took too long to start. Try again or use the quick workspace.',
              ),
            ),
          60_000,
        );
        const finish = (error?: Error, port?: number) => {
          clearTimeout(timer);
          child.removeListener('error', failed);
          child.removeListener('exit', exited);
          if (error) reject(error);
          else resolve(port!);
        };
        const failed = (error: Error) => finish(error);
        const exited = () =>
          finish(
            new Error(`Theia could not start. ${diagnostic.slice(-1200)}`),
          );
        child.once('error', failed);
        child.once('exit', exited);
        child.stderr?.on('data', (data) => {
          diagnostic = (diagnostic + data.toString()).slice(-2000);
        });
        child.stdout?.on('data', (data) => {
          stdout = (stdout + data.toString()).slice(-8000);
          const match = stdout.match(/EDORAX_IDE_READY:(\d+)/);
          if (match) finish(undefined, Number(match[1]));
        });
      });
      this.session = { folder: root, url: `http://127.0.0.1:${port}/` };
      return this.session;
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.starting = false;
    }
  }
  async importSnippet(source: string, filename: string) {
    if (!this.session) throw new Error('Open a local project first.');
    if (
      typeof source !== 'string' ||
      Buffer.byteLength(source) > 64 * 1024 ||
      source.includes('\0')
    )
      throw new Error('Snippet must be text up to 64 KB.');
    if (
      typeof filename !== 'string' ||
      !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,12}$/.test(filename)
    )
      throw new Error('Invalid snippet filename.');
    const unique = `${path.parse(filename).name}-${randomBytes(5).toString('hex')}${path.extname(filename)}`;
    const target = path.join(this.session.folder, unique);
    await writeFile(target, source, { flag: 'wx' });
    return { uri: pathToFileURL(target).href };
  }
  async stop() {
    const child = this.child;
    this.child = undefined;
    this.session = null;
    this.token = '';
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
}
