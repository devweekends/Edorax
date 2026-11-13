// One-click Docker setup for shell labs. Labs run in the learner's own Docker, so the app can:
// check whether Docker is ready, start it if it is installed, or download the official installer
// and open it. It never installs silently: the installer shows its own license and permission
// screens, and Linux only opens the official guide because the steps depend on the distribution.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFile, spawn } from 'node:child_process';
import type Docker from 'dockerode';

export type DockerReadiness =
  | { state: 'ready' }
  /** Installed, but the engine is not answering: Docker Desktop is closed or still starting. */
  | { state: 'not-running'; canStart: boolean }
  | { state: 'missing'; platform: NodeJS.Platform };

export interface DockerSetupProgress {
  phase: 'download' | 'verify' | 'install' | 'done' | 'error';
  /** 0 to 100 while downloading. */
  percent?: number;
  message: string;
  /** Where the installer was saved, when the app could not open it itself. */
  savedTo?: string;
}

export interface InstallerSource {
  url: string;
  fileName: string;
}

/** Only these hosts may serve the installer. The app never downloads from anywhere else. */
export const INSTALLER_HOSTS: readonly string[] = ['desktop.docker.com'];
const LINUX_GUIDE = 'https://docs.docker.com/engine/install/';

/** The official installer for this machine, or null where the app cannot install (Linux). */
export function installerFor(
  platform: NodeJS.Platform,
  arch: string,
): InstallerSource | null {
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64';
  if (platform === 'win32')
    return {
      url: `https://desktop.docker.com/win/main/${cpu}/Docker%20Desktop%20Installer.exe`,
      fileName: 'Docker Desktop Installer.exe',
    };
  if (platform === 'darwin')
    return {
      url: `https://desktop.docker.com/mac/main/${cpu}/Docker.dmg`,
      fileName: 'Docker.dmg',
    };
  return null;
}

export function installerUrlAllowed(
  url: string,
  hosts: readonly string[] = INSTALLER_HOSTS,
): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && hosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Where Docker Desktop lives once installed, per platform. */
export function desktopPaths(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'win32') {
    const roots = [
      env.ProgramFiles,
      env.ProgramW6432,
      'C:\\Program Files',
    ].filter((value): value is string => Boolean(value));
    return [...new Set(roots)].map((root) =>
      path.join(root, 'Docker', 'Docker', 'Docker Desktop.exe'),
    );
  }
  if (platform === 'darwin') return ['/Applications/Docker.app'];
  return [];
}

export async function dockerReadiness(
  docker: Docker,
  platform: NodeJS.Platform = process.platform,
): Promise<DockerReadiness> {
  try {
    await docker.ping();
    return { state: 'ready' };
  } catch {
    /* Not answering: installed but closed, or not installed. */
  }
  const installed =
    desktopPaths(platform).some((candidate) => fs.existsSync(candidate)) ||
    (platform === 'linux' && (await onPath('docker')));
  if (!installed) return { state: 'missing', platform };
  return {
    state: 'not-running',
    canStart: platform === 'win32' || platform === 'darwin',
  };
}

function onPath(command: string): Promise<boolean> {
  return new Promise((resolve) =>
    execFile(
      process.platform === 'win32' ? 'where' : 'which',
      [command],
      (error) => resolve(!error),
    ),
  );
}

/** Opens an installed Docker Desktop so the engine starts. The learner may still need to wait a minute. */
export function startDockerDesktop(
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    if (platform === 'win32') {
      const exe = desktopPaths(platform).find((candidate) =>
        fs.existsSync(candidate),
      );
      if (!exe) return false;
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    if (platform === 'darwin') {
      spawn('open', ['-a', 'Docker'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** Downloads a file over HTTPS with progress. Follows up to 5 redirects, and only to allowed hosts. */
export function download(
  url: string,
  target: string,
  onPercent: (percent: number) => void,
  hosts: readonly string[] = INSTALLER_HOSTS,
  redirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!installerUrlAllowed(url, hosts))
      return reject(new Error('The installer address is not allowed.'));
    const partial = `${target}.part`;
    const request = https.get(
      url,
      { headers: { 'User-Agent': 'edorax-desktop' } },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects <= 0) return reject(new Error('Too many redirects.'));
          return download(
            new URL(response.headers.location, url).toString(),
            target,
            onPercent,
            hosts,
            redirects - 1,
          ).then(resolve, reject);
        }
        if (status !== 200) {
          response.resume();
          return reject(
            new Error(`The download failed with status ${status}.`),
          );
        }
        const total = Number(response.headers['content-length'] ?? 0);
        let received = 0;
        let last = -1;
        const file = fs.createWriteStream(partial);
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total) {
            const percent = Math.floor((received / total) * 100);
            if (percent !== last) {
              last = percent;
              onPercent(percent);
            }
          }
        });
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (total && received !== total)
              return reject(
                new Error('The download was cut short. Try again.'),
              );
            fs.rename(partial, target, (error) =>
              error ? reject(error) : resolve(),
            );
          });
        });
        file.on('error', reject);
        response.on('error', reject);
      },
    );
    request.on('error', reject);
  });
}

/** Windows only: the installer must carry a valid signature from Docker Inc. before the app opens it. */
export function verifyWindowsSignature(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s = Get-AuthenticodeSignature -LiteralPath $args[0]; if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match 'O=Docker Inc') { 'ok' } else { 'bad' }`,
        file,
      ],
      { timeout: 60_000 },
      (error, stdout) => resolve(!error && stdout.trim() === 'ok'),
    );
  });
}

export interface SetupDeps {
  platform: NodeJS.Platform;
  arch: string;
  downloadsDir: string;
  /** Opens a file with its default program (the installer or the disk image). Returns an error text, or '' when opened. */
  openPath: (file: string) => Promise<string>;
  /** Opens a web address in the learner's browser. */
  openExternal: (url: string) => Promise<void>;
  showInFolder: (file: string) => void;
  fetchFile?: typeof download;
  verify?: (file: string) => Promise<boolean>;
}

/**
 * Sets Docker up as far as this machine allows, reporting progress. Windows: download, check the
 * signature, open the installer. macOS: download and open the disk image. Linux: open the guide.
 * If opening the installer fails, the file stays in Downloads and the app shows where it is.
 */
export async function setUpDocker(
  report: (progress: DockerSetupProgress) => void,
  deps: SetupDeps,
): Promise<DockerSetupProgress> {
  const finish = (progress: DockerSetupProgress) => {
    report(progress);
    return progress;
  };
  const source = installerFor(deps.platform, deps.arch);
  if (!source) {
    await deps.openExternal(LINUX_GUIDE).catch(() => {});
    return finish({
      phase: 'done',
      message:
        'The Docker install guide is open in your browser. Install Docker Engine, add your user to the docker group, then press Check again.',
    });
  }
  const target = path.join(deps.downloadsDir, source.fileName);
  try {
    report({
      phase: 'download',
      percent: 0,
      message: 'Downloading Docker Desktop. This is about 600 MB.',
    });
    await (deps.fetchFile ?? download)(source.url, target, (percent) =>
      report({
        phase: 'download',
        percent,
        message: `Downloading Docker Desktop: ${percent}%`,
      }),
    );
  } catch (error) {
    return finish({
      phase: 'error',
      message: `${error instanceof Error ? error.message : 'The download failed.'} Check your internet connection and try again.`,
    });
  }
  if (deps.platform === 'win32') {
    report({
      phase: 'verify',
      message: 'Checking that the installer is signed by Docker Inc.',
    });
    const ok = await (deps.verify ?? verifyWindowsSignature)(target);
    if (!ok) {
      fs.rmSync(target, { force: true });
      return finish({
        phase: 'error',
        message:
          'The installer did not have a valid Docker signature, so it was deleted and not opened. Download Docker Desktop from docker.com instead.',
      });
    }
  }
  report({
    phase: 'install',
    message:
      deps.platform === 'win32'
        ? 'Opening the Docker installer. Windows will ask for permission. Follow the installer, restart if it asks, then press Check again.'
        : 'Opening the Docker disk image. Drag Docker into Applications, open it once, then press Check again.',
  });
  const failure = await deps.openPath(target);
  if (failure) {
    deps.showInFolder(target);
    return finish({
      phase: 'done',
      savedTo: target,
      message: `The installer was downloaded but could not be opened here. It is in ${path.dirname(target)}. Open it yourself, then press Check again.`,
    });
  }
  return finish({
    phase: 'done',
    savedTo: target,
    message:
      'The installer is open. When it finishes, start Docker Desktop and press Check again.',
  });
}

export function defaultDownloadsDir(electronDownloads?: string) {
  return electronDownloads ?? path.join(os.homedir(), 'Downloads');
}
