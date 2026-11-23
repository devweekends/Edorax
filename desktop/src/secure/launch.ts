import { app } from 'electron';
import path from 'node:path';
import { SECURE_DEEP_LINK_SCHEME } from '../../../server/src/shared/api/integrity';
import { parseExamLink, type ExamLaunch } from './exam-link';

export type { ExamLaunch };

// "Start exam" on the website opens edorax://exam/<chapterId>?token=...&course=...&chapter=...
// The link is untrusted input: it is parsed strictly, and the token is kept in the main
// process. The window is only told which exam to open.

const isExamUrl = (value: string) => value.startsWith(`${SECURE_DEEP_LINK_SCHEME}://`);

let listener: ((launch: ExamLaunch) => void) | null = null;
const early: ExamLaunch[] = [];

function receive(url: string) {
  const launch = parseExamLink(url);
  if (!launch) return;
  if (listener) listener(launch);
  else early.push(launch);
}

/** A second copy of the app only forwards its link to the first one. */
export function claimSingleInstance(): boolean {
  return app.requestSingleInstanceLock();
}

/** Call once at load, before the app is ready: macOS can deliver the link before the window exists. */
export function listenForExamLinks() {
  if (process.defaultApp && process.argv.length >= 2)
    app.setAsDefaultProtocolClient(SECURE_DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1]!),
    ]);
  else app.setAsDefaultProtocolClient(SECURE_DEEP_LINK_SCHEME);
  app.on('open-url', (event, url) => {
    event.preventDefault();
    receive(url);
  });
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(isExamUrl);
    if (url) receive(url);
  });
  const cold = process.argv.find(isExamUrl);
  if (cold) receive(cold);
}

/** Starts delivering links to the secure controller, including any that arrived early. */
export function subscribeToExamLinks(next: (launch: ExamLaunch) => void): () => void {
  listener = next;
  for (const launch of early.splice(0)) next(launch);
  return () => {
    if (listener === next) listener = null;
  };
}
