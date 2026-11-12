import { useEffect, useState } from 'react';
import { Code2, TerminalSquare } from 'lucide-react';
import { CodeToolbar } from '@buildment/learning-ui/components/learn/code-toolbar';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { createHighlighter, bundledLanguages } from 'shiki/bundle/web';
import { useCourseIDE } from './CourseIDE';

const highlighter = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});

// Fences tagged with a shell language are commands learners can run as-is.
const CLI_LANGUAGES = new Set([
  'sh',
  'bash',
  'zsh',
  'shell',
  'console',
  'shellsession',
  'terminal',
  'powershell',
  'pwsh',
  'ps',
  'ps1',
  'batch',
  'cmd',
  'dos',
]);

// Fences without a shell tag still get the button when they start with a
// recognizable command word.
const CLI_COMMANDS = new Set([
  'docker',
  'docker-compose',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'node',
  'deno',
  'bash',
  'sh',
  'zsh',
  'fish',
  'git',
  'cd',
  'ls',
  'mkdir',
  'touch',
  'rm',
  'cp',
  'mv',
  'curl',
  'wget',
  'echo',
  'cat',
  'chmod',
  'export',
  'source',
  'sudo',
  'pip',
  'pip3',
  'python',
  'python3',
  'brew',
  'apt',
  'apt-get',
  'kubectl',
  'helm',
  'terraform',
  'dotnet',
  'go',
  'cargo',
  'composer',
  'php',
  'rails',
  'bundle',
  'make',
]);

function looksLikeCommand(source: string): boolean {
  const line = source
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('#'));
  if (!line) return false;
  const word = line
    .replace(/^[$>]\s*/, '')
    .split(/\s+/)[0]
    .toLowerCase();
  return CLI_COMMANDS.has(word);
}

export function LessonSnippet({
  source,
  language,
}: {
  source: string;
  language: string;
}) {
  const ide = useCourseIDE();
  const [html, setHtml] = useState('');
  const isCommand =
    CLI_LANGUAGES.has(language.toLowerCase()) || looksLikeCommand(source);
  useEffect(() => {
    let alive = true;
    setHtml('');
    // Shiki escapes the source; lesson code is never evaluated.
    void highlighter
      .then(async (highlighter) => {
        const lang = language in bundledLanguages ? language : 'text';
        if (lang !== 'text')
          await highlighter.loadLanguage(lang as keyof typeof bundledLanguages);
        const result = highlighter.codeToHtml(source, {
          lang,
          themes: { light: 'github-light', dark: 'github-dark' },
        });
        if (alive) setHtml(result);
      })
      .catch((error) => console.error('Snippet highlighting failed', error));
    return () => {
      alive = false;
    };
  }, [source, language]);
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-border shadow-sm">
      <CodeToolbar language={language} getText={() => source}>
        {isCommand && (
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted"
            onClick={() => ide.runInTerminal(source)}
          >
            <TerminalSquare size={14} />
            Run in terminal
          </button>
        )}
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted"
          onClick={() => ide.openSnippet(source, language)}
        >
          <Code2 size={14} />
          Open in IDE
        </button>
      </CodeToolbar>
      {html ? (
        <div
          className="lesson-snippet"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-[13px] leading-6">
          <code>{source}</code>
        </pre>
      )}
    </figure>
  );
}
