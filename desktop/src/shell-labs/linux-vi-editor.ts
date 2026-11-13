import type { ShellLab } from '../domain/shell-labs';

export const linuxViEditor: ShellLab = {
  slug: 'linux-vi-editor',
  topic: 'linux',
  level: 'beginner',
  tags: ['vi', 'Editor'],
  title: 'The vi editor',
  summary: 'Edit real config files the way you will on any server: fix a typo, delete lines by pattern, replace across a file and write a new one.',
  scenario:
    'vi is on every Unix machine you will ever log in to, often as the only editor. edit1 has a config with a typo, debug lines that must go before release, a page with last year\'s date everywhere, and no message of the day. Open each file with `vi FILE` and fix it there. You are root.',
  minutes: 45,
  machine: { name: 'edit1', image: 'ubuntu:24.04', packages: ['vim'] },
  setup: String.raw`set -e
mkdir -p /etc/shop /srv/site
cat > /etc/shop/app.conf <<'CONF'
# Shop settings
name = shop
prot = 8080
#DEBUG log_sql = true
workers = 4
#DEBUG trace = all
timeout = 30
#DEBUG dump_requests = true
CONF
cat > /srv/site/index.html <<'HTML'
<h1>Shop 2025</h1>
<p>Welcome to our 2025 collection.</p>
<p>Sale ends 31 December 2025.</p>
<footer>Copyright 2025 Shop Ltd</footer>
HTML
`,
  steps: [
    {
      id: 'typo',
      goal: 'In /etc/shop/app.conf, fix the misspelt setting prot so it reads port = 8080.',
      body: 'vi has modes. It opens in normal mode, where keys are commands: arrows or h j k l move, `x` deletes a character. Press `i` to insert text and `Esc` to go back to normal mode. Type `:wq` and Enter to write and quit, or `:q!` to quit without saving.',
      hints: [
        'Open the file, move to the word, fix two letters, then save and quit.',
        'Use `/prot` and Enter to jump to the word. `cw` changes the word: type port, then Esc. `:wq` saves.',
        'In a file with "colour = red" to fix: `vi file`, `/colour` Enter, `cw` then type color, Esc, `:wq`. `cat file` shows the change.',
      ],
      checks: [
        { id: 'fixed', label: 'The file has port = 8080', run: 'grep -qx "port = 8080" /etc/shop/app.conf', fail: 'There is no line exactly "port = 8080".' },
        { id: 'no-typo', label: 'prot is gone', run: '! grep -q "^prot" /etc/shop/app.conf', fail: 'The misspelt prot line is still there.' },
      ],
      solution: "sed -i 's/^prot = 8080$/port = 8080/' /etc/shop/app.conf",
    },
    {
      id: 'delete-lines',
      goal: 'Delete every line starting with #DEBUG from /etc/shop/app.conf, and keep the others.',
      body: 'Deleting lines one by one works, but vi can act on every line matching a pattern. In normal mode, `dd` deletes the current line. The global command `:g/PATTERN/d` deletes every line that matches.',
      hints: [
        'One : command can remove all three lines at once.',
        '`:g/^#DEBUG/d` deletes each line that starts with #DEBUG. `^` means the start of the line. Then `:wq`.',
        'To remove every line containing TODO: `:g/TODO/d`, check, then `:wq`. Pressing `u` undoes a change you did not mean.',
      ],
      checks: [
        { id: 'gone', label: 'No #DEBUG lines are left', run: '! grep -q "^#DEBUG" /etc/shop/app.conf', fail: 'Some lines starting with #DEBUG are still there.' },
        { id: 'kept', label: 'The real settings are all there', run: 'for s in "name = shop" "workers = 4" "timeout = 30" "# Shop settings"; do grep -qx "$s" /etc/shop/app.conf || exit 1; done', fail: 'A setting that is not a #DEBUG line was deleted. Undo with u, or Reset.' },
      ],
      solution: "sed -i '/^#DEBUG/d' /etc/shop/app.conf",
    },
    {
      id: 'replace',
      goal: 'In /srv/site/index.html, change every 2025 to 2026.',
      body: 'The substitute command replaces text: `:s/OLD/NEW/` on the current line. `%` before it means every line, and `g` after it means every match on a line, not only the first.',
      hints: [
        'One substitute over the whole file, every match.',
        '`:%s/2025/2026/g` then `:wq`. Add `c` at the end, `/gc`, to confirm each change.',
        'To rename a product everywhere: `:%s/OldName/NewName/g`. Leaving out g would change only the first match on each line.',
      ],
      checks: [
        { id: 'none-left', label: 'No 2025 left', run: '! grep -q 2025 /srv/site/index.html', fail: 'There is still a 2025 in the page.' },
        { id: 'all-changed', label: 'Four 2026s', run: '[ "$(grep -o 2026 /srv/site/index.html | wc -l)" = 4 ]', fail: 'The page should have 2026 in the four places it had 2025.' },
      ],
      solution: "sed -i 's/2025/2026/g' /srv/site/index.html",
    },
    {
      id: 'new-file',
      goal: 'Create /etc/motd with exactly two lines: Welcome to edit1 and Authorised users only.',
      body: 'The message of the day is shown to people when they log in. `vi NEWFILE` opens an empty buffer; nothing is created on disk until you write it. `o` opens a new line below the cursor in insert mode.',
      hints: [
        'Open the new file, insert the two lines, save and quit.',
        '`vi /etc/motd`, press `i`, type the first line, Enter, the second line, Esc, `:wq`.',
        'For a file /etc/issue.net with one line: `vi /etc/issue.net`, `i`, type the line, Esc, `:wq`, then `cat /etc/issue.net`.',
      ],
      checks: [{ id: 'content', label: '/etc/motd has the two lines', run: String.raw`diff <(sed -e 's/[[:space:]]*$//' /etc/motd 2>/dev/null | sed -e '/^$/d') <(printf 'Welcome to edit1\nAuthorised users only\n') >/dev/null`, fail: '/etc/motd should have exactly the lines "Welcome to edit1" and "Authorised users only".' }],
      solution: "printf 'Welcome to edit1\\nAuthorised users only\\n' > /etc/motd",
    },
  ],
};
