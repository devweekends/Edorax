import type { ShellLab } from '../domain/shell-labs';

export const linuxBasicCommands1: ShellLab = {
  slug: 'linux-basic-commands-1',
  topic: 'linux',
  level: 'beginner',
  tags: ['Commands', 'Navigation', 'Files'],
  title: 'Basic commands 1: navigate and organise files',
  summary: 'Sort a messy website folder with wildcards, find a hidden file, take a full backup and clean out old files safely.',
  scenario:
    'The company website lives in /srv/site and nobody has tidied it in years. Images sit next to pages, an old copy of everything is still in there, and backup files are scattered around. Organise it and take a backup before anything is deleted. You are root on web1.',
  minutes: 60,
  machine: { name: 'web1', image: 'ubuntu:24.04' },
  setup: String.raw`set -e
mkdir -p /srv/site/css /srv/site/old
cd /srv/site
for page in index about contact; do echo "<h1>$page</h1>" > $page.html; done
echo "body { color: #222; }" > css/style.css
echo "PNG" > logo.png
for n in 1 2 3 4 5; do echo "JPEG $n" > photo$n.jpg; done
echo "API_KEY=abc123" > .env
echo "<h1>old index</h1>" > old/index.html
echo "backup" > index.html.bak
echo "backup" > css/style.css.bak
`,
  steps: [
    {
      id: 'images',
      goal: 'Move every .jpg and .png file at the top of /srv/site into a new folder /srv/site/images.',
      body: 'A wildcard lets one command match many files: `*` stands for any run of characters, so `*.jpg` means every name ending in .jpg. The shell expands the pattern into the list of names before the command runs.',
      hints: [
        'Make the folder, then move all the images with one or two wildcard moves.',
        '`mv *.jpg *.png images/` moves both kinds at once when you are inside /srv/site. `ls` with the same pattern shows what will match before you move anything.',
        'For PDFs in /srv/docs: `cd /srv/docs`, `mkdir pdf`, `ls *.pdf` to preview, then `mv *.pdf pdf/`.',
      ],
      checks: [
        { id: 'moved', label: 'All six images are in images/', run: '[ "$(find /srv/site/images -maxdepth 1 -type f \\( -name "*.jpg" -o -name "*.png" \\) 2>/dev/null | wc -l)" = 6 ]', fail: 'images/ does not hold the five photos and the logo yet.' },
        { id: 'none-left', label: 'No images are left at the top', run: '[ -z "$(find /srv/site -maxdepth 1 -type f \\( -name "*.jpg" -o -name "*.png" \\))" ]', fail: 'Some .jpg or .png files are still directly in /srv/site.' },
      ],
      solution: 'mkdir -p /srv/site/images && cd /srv/site && mv *.jpg *.png images/',
    },
    {
      id: 'hidden',
      goal: 'Find the hidden file in /srv/site and copy it to /root/env-backup.',
      body: 'Files whose names start with a dot are hidden: plain `ls` skips them. They often hold settings and secrets. `ls -a` shows everything, and `ls -la` adds details.',
      hints: [
        'List the folder again, including hidden files.',
        '`ls -la /srv/site` shows names starting with a dot. Copy that one with `cp`.',
        'For a hidden settings file in /opt/app: `ls -la /opt/app` shows .config, then `cp /opt/app/.config /root/config-backup`.',
      ],
      checks: [{ id: 'copied', label: '/root/env-backup matches the hidden file', run: 'cmp -s /srv/site/.env /root/env-backup', fail: '/root/env-backup is missing or is not a copy of the hidden file in /srv/site.' }],
      solution: 'cp /srv/site/.env /root/env-backup',
    },
    {
      id: 'backup',
      goal: 'Copy the whole of /srv/site, with its folders and hidden files, to /srv/site-backup.',
      body: 'Before deleting anything, take a backup. Copying a folder needs the recursive option, and a good backup also keeps each file\'s permissions and times.',
      hints: [
        'One cp command with an option that goes into every folder.',
        '`cp -r` copies a folder recursively. `cp -a` does the same and also keeps permissions, owners and times, which is what you want for a backup.',
        'For /etc/nginx: `cp -a /etc/nginx /root/nginx-backup`, then `ls -la /root/nginx-backup` shows the same files, hidden ones included.',
      ],
      checks: [
        { id: 'complete', label: 'Every file is in the backup', run: String.raw`for f in index.html about.html contact.html .env css/style.css old/index.html images/logo.png images/photo1.jpg images/photo5.jpg index.html.bak; do [ -f "/srv/site-backup/$f" ] || exit 1; done`, fail: '/srv/site-backup is missing, or some files are not in it. Did you include folders and the hidden file? Finish the first step first.' },
        { id: 'same', label: 'Backed-up files are identical', run: 'cmp -s /srv/site-backup/.env /srv/site/.env && cmp -s /srv/site-backup/css/style.css /srv/site/css/style.css', fail: 'Some files in the backup differ from the originals.' },
      ],
      solution: 'cp -a /srv/site /srv/site-backup',
    },
    {
      id: 'clean',
      goal: 'Delete /srv/site/old and every .bak file anywhere under /srv/site. Keep the backup.',
      body: 'Wildcards only look in one folder. To find files in every folder below, use `find`, which can also delete what it finds. Run it without deleting first to see the list.',
      hints: [
        'Remove the old folder, then let find locate the .bak files in all folders.',
        '`find /srv/site -name "*.bak"` lists them. Adding `-delete` removes what it listed. Quote the pattern so the shell does not expand it first.',
        'For .tmp files under /var/www: `find /var/www -name "*.tmp"` to check, then `find /var/www -name "*.tmp" -delete`.',
      ],
      checks: [
        { id: 'old-gone', label: '/srv/site/old is gone', run: '[ ! -e /srv/site/old ]', fail: '/srv/site/old still exists.' },
        { id: 'bak-gone', label: 'No .bak files under /srv/site', run: '[ -z "$(find /srv/site -name "*.bak")" ]', fail: 'There are still .bak files under /srv/site. Some are inside folders.' },
        { id: 'pages-kept', label: 'The pages and backup are untouched', run: '[ -f /srv/site/index.html ] && [ -f /srv/site/css/style.css ] && [ -f /srv/site-backup/old/index.html ]', fail: 'A page, the stylesheet or the backup was deleted. Reset to start again.' },
      ],
      solution: 'rm -r /srv/site/old && find /srv/site -name "*.bak" -delete',
    },
  ],
};
