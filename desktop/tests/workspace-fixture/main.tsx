import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CourseIDEProvider,
  CourseIDEPanel,
  OpenIDEButton,
} from '../../src/ui/labs/CourseIDE';
import '../../src/styles/index.css';

const calls: string[] = [];
const folders = new Map<string, string>();
let current: { folder: string; url: string } | null = null;
Object.assign(window, { workspaceCalls: calls });
window.buildment = {
  ide: {
    async resume(course: string) {
      calls.push(`resume:${course}`);
      current = folders.has(course)
        ? { folder: folders.get(course)!, url: 'http://localhost:9999' }
        : null;
      return current;
    },
    async status() {
      return current;
    },
    async open(create: boolean, course: string) {
      calls.push(`open:${course}`);
      const folder = `/projects/${course}${create ? '-new' : ''}`;
      folders.set(course, folder);
      return (current = { folder, url: 'http://localhost:9999' });
    },
    async bounds() {},
    async revealExplorer() {},
    async importSnippet() {
      return { uri: '' };
    },
  },
  labs: {
    async prepareTerminal(course: string) {
      calls.push(`terminal:${course}`);
      return {
        blockId: course,
        folder: folders.get(course) || '/home/learner',
      };
    },
    async openTerminal() {
      calls.push('terminal-open');
    },
    async closeTerminal() {
      calls.push('terminal-close');
    },
    async resizeTerminal() {},
    async terminalInput() {},
    onTerminalData() {
      return () => {};
    },
    async configure() {
      return { mode: 'docker' };
    },
    async status() {
      return {
        available: false,
        running: false,
        message: 'Docker is unavailable. Open Docker Desktop.',
      };
    },
  },
} as unknown as typeof window.buildment;
function App() {
  const [course, setCourse] = useState('course-a');
  return (
    <>
      <button
        onClick={() =>
          setCourse(course === 'course-a' ? 'course-b' : 'course-a')
        }
      >
        Switch course
      </button>
      <p>{course}</p>
      <CourseIDEProvider key={course}>
        <OpenIDEButton />
        <div style={{ height: 650, display: 'flex' }}>
          <CourseIDEPanel courseSlug={course} smallWindow={false} />
        </div>
      </CourseIDEProvider>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
