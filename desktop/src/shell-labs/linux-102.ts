import type { ShellLab } from '../domain/shell-labs';

// The access log is generated the same way every time, so the expected answers are fixed.
const LOG = '/var/log/shop/access.log';

export const linux102: ShellLab = {
  slug: 'linux-102',
  topic: 'linux',
  level: 'beginner',
  tags: ['Pipes', 'Redirection', 'Scripts'],
  title: 'Linux 102: text, pipes and your first script',
  summary: 'Answer real questions about a web log with grep, wc, sort and uniq, then turn the answer into a script anyone can run.',
  scenario:
    'The shop had a bad night. The web server wrote every request to /var/log/shop/access.log, one line each: the visitor\'s address, the page and the status code. The team wants to know how many requests failed and who sent the most traffic, and a script to answer it next time. You are root on shop1.',
  minutes: 45,
  machine: { name: 'shop1', image: 'ubuntu:24.04' },
  setup: String.raw`set -e
mkdir -p /var/log/shop
pages=(/ /cart /checkout /login /search /product/7)
: > ${LOG}
for i in $(seq 1 400); do
  ip="10.0.0.$(( (i * 7) % 23 + 1 ))"
  [ $((i % 9)) -eq 0 ] && ip="10.0.0.66"
  status=200
  [ $((i % 13)) -eq 0 ] && status=500
  [ $((i % 17)) -eq 0 ] && status=404
  echo "$ip GET ${'$'}{pages[$((i % 6))]} $status" >> ${LOG}
done
`,
  steps: [
    {
      id: 'errors-file',
      goal: 'Save every line of the log with status 500 into /root/errors.txt.',
      body: '`grep` prints only the lines that contain a pattern. Every line ends with its status code, and 500 means the server failed. Send the matching lines into a file with `>`.',
      hints: [
        'Search the log for 500 and redirect the result into the file.',
        '`grep PATTERN FILE > OUTPUT`. Searching for " 500" with the space in front avoids matching an address or page that happens to contain 500.',
        'For 404s in /var/log/web.log: `grep " 404" /var/log/web.log > /root/missing.txt`, then `head /root/missing.txt` to look at it.',
      ],
      checks: [
        { id: 'exists', label: '/root/errors.txt exists', run: '[ -s /root/errors.txt ]', fail: '/root/errors.txt is missing or empty.' },
        { id: 'exact', label: 'It has exactly the 500 lines', run: `cmp -s /root/errors.txt <(grep " 500$" ${LOG})`, fail: 'errors.txt does not hold exactly the lines that end in status 500. Check you did not match 404 lines or miss some.' },
      ],
      solution: `grep " 500$" ${LOG} > /root/errors.txt`,
    },
    {
      id: 'count',
      goal: 'Write the number of failed requests, just the number, into /root/error-count.txt.',
      body: 'A pipe, `|`, feeds what one command prints into the next one. `wc -l` counts lines. Together they turn a list into a number without saving anything in between.',
      hints: [
        'Count the 500 lines. You can count the file you made, or pipe grep straight into a counter.',
        '`grep " 500$" FILE | wc -l` prints a count. `grep -c` counts too. Redirect the number into the file.',
        'For 404s: `grep " 404$" /var/log/web.log | wc -l > /root/count.txt`, and `cat /root/count.txt` shows one number.',
      ],
      checks: [
        { id: 'number', label: 'error-count.txt has the right number', run: `[ "$(tr -d ' \\n' < /root/error-count.txt 2>/dev/null)" = "$(grep -c " 500$" ${LOG})" ]`, fail: 'error-count.txt does not contain the number of 500 lines, and nothing else.' },
      ],
      solution: `grep -c " 500$" ${LOG} > /root/error-count.txt`,
    },
    {
      id: 'top-ip',
      goal: 'Find the address that sent the most requests, and write it into /root/top-ip.txt.',
      body: 'This is the classic pipeline: cut out the first column, sort it so equal addresses sit together, count each group with `uniq -c`, then sort the counts biggest first.',
      hints: [
        'Four commands joined by pipes, then take the first line.',
        '`awk \'{print $1}\'` prints the first column. `sort | uniq -c | sort -rn | head -1` shows the top count and its address. Write only the address into the file.',
        'For the most visited page: `awk \'{print $3}\' /var/log/web.log | sort | uniq -c | sort -rn | head -1` prints for example "120 /cart". Then `echo /cart > /root/top-page.txt`.',
      ],
      checks: [
        { id: 'address', label: 'top-ip.txt has the busiest address', run: `[ "$(tr -d ' \\n' < /root/top-ip.txt 2>/dev/null)" = "$(awk '{print $1}' ${LOG} | sort | uniq -c | sort -rn | awk 'NR==1{print $2}')" ]`, fail: 'top-ip.txt does not contain the address with the most requests, and nothing else.' },
      ],
      solution: `awk '{print $1}' ${LOG} | sort | uniq -c | sort -rn | awk 'NR==1{print $2}' > /root/top-ip.txt`,
    },
    {
      id: 'script',
      goal: 'Create a command, count-errors, that prints how many 500 lines are in the log file it is given.',
      body: 'A script is a text file of commands. The first line, `#!/bin/bash`, says which program runs it. `$1` is the first thing typed after the command. To run it by name it must be executable and in a folder on the PATH, such as `/usr/local/bin`. It is tested on a log it has never seen.',
      hints: [
        'Write the file /usr/local/bin/count-errors, make it executable, then try `count-errors /var/log/shop/access.log`.',
        'The script needs two lines: `#!/bin/bash` and your grep count using "$1" as the file. `chmod +x` makes it executable.',
        'A script that counts 404s: `printf \'#!/bin/bash\\ngrep -c " 404$" "$1"\\n\' > /usr/local/bin/count-404`, `chmod +x /usr/local/bin/count-404`, then `count-404 /var/log/web.log`.',
      ],
      checks: [
        { id: 'runnable', label: 'count-errors is an executable command', run: '[ -x /usr/local/bin/count-errors ]', fail: '/usr/local/bin/count-errors does not exist or is not executable. Did you chmod +x it?' },
        { id: 'real-log', label: 'It counts the real log correctly', run: `[ "$(/usr/local/bin/count-errors ${LOG} 2>/dev/null | tr -d ' \\n')" = "$(grep -c " 500$" ${LOG})" ]`, fail: 'count-errors on the access log does not print the number of 500 lines.' },
        { id: 'new-log', label: 'It works on a log it has never seen', run: String.raw`f=$(mktemp); printf '1.1.1.1 GET / 200\n2.2.2.2 GET /x 500\n3.3.3.3 GET /y 500\n4.4.4.4 GET /5000 404\n' > "$f"; out=$(/usr/local/bin/count-errors "$f" 2>/dev/null | tr -d ' \n'); rm -f "$f"; [ "$out" = 2 ]`, fail: 'On a small test log with two 500 lines, count-errors did not print 2. Use "$1" for the file instead of a fixed path.' },
      ],
      solution: `printf '#!/bin/bash\\ngrep -c " 500$" "$1"\\n' > /usr/local/bin/count-errors && chmod +x /usr/local/bin/count-errors`,
    },
  ],
};
