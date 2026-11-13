import type { ShellLab } from '../domain/shell-labs';

export const linuxBasicCommands2: ShellLab = {
  slug: 'linux-basic-commands-2',
  topic: 'linux',
  level: 'beginner',
  tags: ['Commands', 'Search', 'Archives'],
  title: 'Basic commands 2: find, grep and archives',
  summary: 'Track down the files filling a disk, find which config holds a setting, pack logs into an archive and collect this week\'s uploads.',
  scenario:
    'The app on app1 has been running for a year and its folder, /home/app, is a mess of uploads, logs and configs. Support needs a few things today: what is eating the disk, which file sets the database host, an archive of the logs, and the uploads from this week. You are root.',
  minutes: 60,
  machine: { name: 'app1', image: 'ubuntu:24.04' },
  setup: String.raw`set -e
mkdir -p /home/app/uploads /home/app/logs/old /home/app/config /home/app/cache /home/app/media
head -c 6291456 /dev/zero > /home/app/media/intro-video.mp4
head -c 8388608 /dev/zero > /home/app/cache/thumbnails.db
head -c 7340032 /dev/zero > /home/app/logs/old/2025-debug.log
head -c 1048576 /dev/zero > /home/app/media/logo.svg
printf 'listen = 8080\nworkers = 4\n' > /home/app/config/server.ini
printf 'db_host = 10.0.0.5\ndb_name = shop\n' > /home/app/config/database.ini
printf 'theme = dark\n' > /home/app/config/ui.ini
for d in 1 2 3; do echo "app log day $d" > /home/app/logs/app-$d.log; done
echo "worker log" > /home/app/logs/worker.log
for n in 1 2 3 4 5 6; do echo "upload $n" > /home/app/uploads/file-$n.jpg; done
touch -d '20 days ago' /home/app/uploads/file-1.jpg /home/app/uploads/file-2.jpg /home/app/uploads/file-3.jpg
touch -d '2 days ago' /home/app/uploads/file-4.jpg
touch -d '1 hour ago' /home/app/uploads/file-5.jpg /home/app/uploads/file-6.jpg
`,
  steps: [
    {
      id: 'big-files',
      goal: 'List every file over 5 MB under /home/app, full paths one per line, in /root/big-files.txt.',
      body: '`find` walks a folder tree and prints every path that matches your tests: name, type, size, age and more. Its size test uses `+` for "more than".',
      hints: [
        'One find with a type test and a size test, redirected into the file.',
        '`find /home/app -type f -size +5M` lists files bigger than 5 MB. `du -h` on a file shows how big it is.',
        'For files over 100 MB in /var: `find /var -type f -size +100M > /root/huge.txt`, then `cat /root/huge.txt`.',
      ],
      checks: [{ id: 'list', label: 'The list has exactly the big files', run: String.raw`diff <(sort /root/big-files.txt 2>/dev/null | sed '/^$/d') <(find /home/app -type f -size +5M | sort) >/dev/null`, fail: '/root/big-files.txt does not list exactly the files over 5 MB, with full paths. There are three.' }],
      solution: 'find /home/app -type f -size +5M > /root/big-files.txt',
    },
    {
      id: 'which-config',
      goal: 'Find the config file that sets db_host and copy it to /root/db-config.',
      body: '`grep` searches inside files. With `-r` it searches every file under a folder, and `-l` prints only the names of files that match, not the lines.',
      hints: [
        'Search the config folder for db_host and note which file it names.',
        '`grep -rl db_host /home/app/config` prints the matching file names. Then copy that file.',
        'To find where "timeout" is set under /etc/app: `grep -rl timeout /etc/app`, then `cp /etc/app/net.conf /root/`.',
      ],
      checks: [{ id: 'copied', label: '/root/db-config is the database config', run: 'cmp -s /root/db-config /home/app/config/database.ini', fail: '/root/db-config is missing or is not the file that sets db_host.' }],
      solution: 'cp "$(grep -rl db_host /home/app/config)" /root/db-config',
    },
    {
      id: 'archive',
      goal: 'Pack every .log file in /home/app/logs, including old/, into a gzip archive /root/logs.tar.gz.',
      body: '`tar` puts many files into one archive. `c` creates, `z` compresses with gzip, `f` names the archive file, and `t` lists what an archive holds without unpacking it.',
      hints: [
        'Create a compressed tar of the logs folder, then list it to check.',
        '`tar -czf ARCHIVE.tar.gz FOLDER` creates it. `tar -tzf ARCHIVE.tar.gz` lists it. `-C /home/app` keeps the paths short.',
        'For /etc/nginx: `tar -czf /root/nginx.tar.gz -C /etc nginx`, then `tar -tzf /root/nginx.tar.gz | head`.',
      ],
      checks: [
        { id: 'valid', label: 'logs.tar.gz is a valid gzip archive', run: 'tar -tzf /root/logs.tar.gz >/dev/null 2>&1', fail: '/root/logs.tar.gz is missing or is not a gzip-compressed tar archive.' },
        { id: 'complete', label: 'It holds all five logs', run: String.raw`list=$(tar -tzf /root/logs.tar.gz 2>/dev/null); for f in app-1.log app-2.log app-3.log worker.log 2025-debug.log; do echo "$list" | grep -q "$f$" || exit 1; done`, fail: 'The archive is missing some of the .log files. Include the old/ folder too.' },
      ],
      solution: 'tar -czf /root/logs.tar.gz -C /home/app logs',
    },
    {
      id: 'recent',
      goal: 'Copy the uploads changed in the last 7 days into /root/recent.',
      body: 'Every file records when it last changed. `ls -lt` sorts by that time, and `find` can test it with `-mtime`: `-mtime -7` means changed less than 7 days ago.',
      hints: [
        'Find the recent files in uploads, then copy them. find can run a command on each file it finds.',
        '`find /home/app/uploads -type f -mtime -7` lists them. `-exec cp {} /root/recent/ \\;` copies each one; make the folder first.',
        'For configs changed today in /etc: `mkdir /root/today`, then `find /etc -type f -mtime -1 -exec cp {} /root/today/ \\;`.',
      ],
      checks: [
        { id: 'right-files', label: 'Exactly this week\'s uploads are in /root/recent', run: String.raw`[ "$(ls /root/recent 2>/dev/null | sort | tr '\n' ' ')" = "file-4.jpg file-5.jpg file-6.jpg " ]`, fail: '/root/recent should hold the three uploads from the last 7 days, and nothing else.' },
      ],
      solution: 'mkdir -p /root/recent && find /home/app/uploads -type f -mtime -7 -exec cp {} /root/recent/ \\;',
    },
  ],
};
