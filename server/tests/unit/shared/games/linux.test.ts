import { describe, expect, it } from "vitest";
import { linuxEngine, createLinuxSession, type LinuxSubmission } from "../../../../src/shared/games/linux/engine.js";
import { MISSIONS, missionById } from "../../../../src/shared/games/linux/missions.js";
import { Shell } from "../../../../src/shared/games/linux/shell.js";
import { compilePatterns, globMatch } from "../../../../src/shared/games/linux/regex.js";
import { DIFFICULTIES } from "../../../../src/shared/games/types.js";

const round = (id: string) => linuxEngine.roundsFor("2026-11-18").find((r) => r.id === id) ?? { ...linuxEngine.roundsFor("2026-11-18")[0]!, id };

/** Run commands on a mission and return everything that was printed. */
function play(id: string, commands: string[]): { shell: Shell; text: string[]; last: string } {
  const shell = new Shell(missionById(id)!);
  const text: string[] = [];
  let last = "";
  for (const c of commands) {
    const res = shell.run(c);
    last = res.lines.map((l) => l.text).join("\n");
    text.push(last);
  }
  return { shell, text, last };
}

const run1 = (id: string, command: string) => play(id, [command]).last;

describe("linux missions", () => {
  it("has at least four missions in every difficulty, with unique ids", () => {
    for (const d of DIFFICULTIES) expect(MISSIONS.filter((m) => m.difficulty === d).length).toBeGreaterThanOrEqual(4);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
  });

  it("gives every mission a story, objectives, par and hints, and plain text", () => {
    for (const m of MISSIONS) {
      expect(m.story.length).toBeGreaterThan(30);
      expect(m.objectives.length).toBeGreaterThanOrEqual(3);
      expect(m.hints.length).toBeGreaterThanOrEqual(3);
      expect(m.par).toBeGreaterThan(0);
      const all = [m.title, m.brief, m.story, ...m.hints, ...m.objectives.map((o) => o.label)].join(" ");
      expect(all).not.toMatch(/[–—]/);
    }
  });

  for (const m of MISSIONS) {
    describe(m.id, () => {
      const r = linuxEngine.roundsFor("2026-11-18")[0]!;
      const target = { ...r, id: m.id, difficulty: m.difficulty, par: m.par };

      it("is solved by its stated solution, with three stars", () => {
        const result = linuxEngine.verify(target, { commands: m.solution, hints: 0 });
        expect(result.message).toBeTruthy();
        expect(result.passed).toBe(true);
        expect(result.stars).toBe(3);
        expect(result.score).toBeLessThanOrEqual(m.par);
      });

      it("is not solved by an empty or a lazy submission", () => {
        expect(linuxEngine.verify(target, { commands: [], hints: 0 }).passed).toBe(false);
        expect(linuxEngine.verify(target, { commands: ["ls", "pwd", "whoami"], hints: 0 }).passed).toBe(false);
      });

      it("is not solved by half of the solution (unless it has one command)", () => {
        if (m.solution.length < 2) return;
        expect(linuxEngine.verify(target, { commands: m.solution.slice(0, -1), hints: 0 }).passed).toBe(false);
      });

      it("ticks every objective when solved", () => {
        const { shell } = play(m.id, m.solution);
        expect(shell.isSolved).toBe(true);
        expect(shell.progress().done.every(Boolean)).toBe(true);
      });
    });
  }

  it("also accepts other ways to solve the config mission", () => {
    const redirect = ["cd app", "grep -v -e '^max_connections' -e '^debug' app.conf > app.conf.new", "echo max_connections=200 >> app.conf.new", "echo debug=false >> app.conf.new", "echo cache_ttl=300 >> app.conf.new", "mv app.conf.new app.conf"];
    const { shell } = play("linux-edit-config", redirect);
    expect(shell.isSolved).toBe(true);
  });

  it("fails the config mission when a redirect wipes the file", () => {
    const { shell, text } = play("linux-edit-config", ["cd app", "grep -v debug app.conf > app.conf", "cat app.conf"]);
    expect(text[2]).toBe("");
    expect(shell.isSolved).toBe(false);
  });

  it("does not let rm -r in /var/tmp pass the temp file mission", () => {
    const { shell } = play("linux-old-temp-files", ["rm -r /var/tmp/*"]);
    expect(shell.isSolved).toBe(false);
  });

  it("needs the newest backup copy, not the last one in the list", () => {
    const wrong = play("linux-restore-backup", ["cp /backups/weekly/2025-12-21/site/config/prod.yml ~/site/config/"]);
    expect(wrong.shell.isSolved).toBe(false);
  });

  it("needs kill -9 for the stubborn process", () => {
    const soft = play("linux-runaway-process", ["kill 4242"]);
    expect(soft.shell.st.procs.some((p) => p.pid === 4242)).toBe(true);
    expect(run1("linux-runaway-process", "kill 77")).toContain("Operation not permitted");
    expect(run1("linux-runaway-process", "kill 99999")).toContain("No such process");
  });

  it("rejects a wrong answer and keeps playing", () => {
    const { shell, last } = play("linux-hidden-note", ["submit wrong"]);
    expect(last).toContain("Not quite");
    expect(shell.isSolved).toBe(false);
  });
});

describe("the shell behaves like Linux", () => {
  const E = "linux-hidden-note";

  it("lists files, hides dotfiles, and shows them with -a and -l", () => {
    expect(run1(E, "ls app")).toBe("README.md  main.py  requirements.txt  static");
    expect(run1(E, "ls -a app")).toContain(".deploy_note");
    expect(run1(E, "ls app | wc -l")).toBe("4");
    const long = run1(E, "ls -l app");
    expect(long).toMatch(/^total \d+/);
    expect(long).toMatch(/-rw-r--r-- 1 ops ops +\d+ \w{3} +\d+ +[\d:]+ main\.py/);
    expect(long).toMatch(/drwxr-xr-x 2 ops ops +4096 .* static/);
  });

  it("changes folder and prints it", () => {
    const { text, shell } = play(E, ["pwd", "cd app", "pwd", "cd ..", "pwd", "cd /nope", "cd app/main.py", "cd -", "cd"]);
    expect(text.slice(0, 5)).toEqual(["/home/ops", "", "/home/ops/app", "", "/home/ops"]);
    expect(text[5]).toBe("bash: cd: /nope: No such file or directory");
    expect(text[6]).toBe("bash: cd: app/main.py: Not a directory");
    expect(text[7]).toBe("/home/ops/app");
    expect(shell.st.cwd).toBe("/home/ops");
    expect(shell.prompt()).toBe("ops:~$");
  });

  it("reads files and says when they are missing or locked", () => {
    expect(run1(E, "cat app/.deploy_note")).toContain("Release word: BLUEFOX-42");
    expect(run1(E, "cat nothing.txt")).toBe("cat: nothing.txt: No such file or directory");
    expect(run1(E, "cat /root/notes.txt")).toBe("cat: /root/notes.txt: Permission denied");
    expect(run1(E, "ls /root")).toBe("ls: cannot open directory '/root': Permission denied");
    expect(run1(E, "cat app")).toBe("cat: app: Is a directory");
    expect(run1(E, "head -n 1 app/.deploy_note")).toBe("Release word: BLUEFOX-42");
    expect(run1(E, "tail -n 1 app/.deploy_note")).toBe("Do not share this word outside the team.");
  });

  it("greps with the common flags", () => {
    const f = "app/.deploy_note";
    expect(run1(E, `grep word ${f}`)).toContain("Release word");
    expect(run1(E, `grep -i RELEASE ${f}`)).toContain("Release word");
    expect(run1(E, `grep RELEASE ${f}`)).toBe("");
    expect(run1(E, `grep -n share ${f}`)).toBe("2:Do not share this word outside the team.");
    expect(run1(E, `grep -c o ${f}`)).toBe("2");
    expect(run1(E, `grep -v Release ${f}`)).toBe("Do not share this word outside the team.");
    expect(run1(E, `grep -E 'BLUE(FOX|BIRD)-[0-9]+' ${f}`)).toContain("BLUEFOX-42");
    expect(run1(E, `grep -o -E '[A-Z]+-[0-9]+' ${f}`)).toBe("BLUEFOX-42");
    expect(run1(E, "grep -r BLUEFOX app")).toBe("app/.deploy_note:Release word: BLUEFOX-42");
    expect(run1(E, "grep -rl flask app")).toBe("app/requirements.txt");
    expect(run1(E, "grep x missing.txt")).toBe("grep: missing.txt: No such file or directory");
    expect(run1(E, "grep '(' app/main.py")).toContain("print(");
    expect(run1(E, "grep -E '(' app/main.py")).toBe("grep: Unmatched ( or \\(");
  });

  it("finds files by name, type, size and age", () => {
    expect(run1(E, "find app -name '*.py'")).toBe("app/main.py");
    expect(run1(E, "find app -type d")).toBe("app\napp/static");
    expect(run1(E, "find . -iname readme.md")).toBe("./app/README.md");
    const big = run1("linux-biggest-file", "find downloads -size +500M");
    expect(big.split("\n").sort()).toEqual(["downloads/holiday-video.mp4", "downloads/setup.iso"]);
    expect(run1("linux-biggest-file", "find downloads -type f -size -10k")).toBe("downloads/notes.txt");
    expect(run1("linux-old-temp-files", "find /var/tmp -name '*.tmp' -mtime +7").split("\n")).toEqual([
      "/var/tmp/cache-a.tmp", "/var/tmp/cache-b.tmp", "/var/tmp/render/frame1.tmp", "/var/tmp/session-91.tmp",
    ]);
    expect(run1(E, "find / -name '*.zzz'")).toContain("Permission denied");
    expect(run1(E, "find / -name '*.zzz' 2>/dev/null")).toBe("");
    expect(run1(E, "find /nope")).toBe("find: '/nope': No such file or directory");
  });

  it("pipes data between commands", () => {
    const L = "linux-count-requests";
    const log = "/var/log/webapp/access.log";
    expect(run1(L, `wc -l ${log}`)).toBe(`214 ${log}`);
    expect(run1(L, `wc -l < ${log}`)).toBe("214");
    expect(run1(L, `cat ${log} | wc -l`)).toBe("214");
    expect(run1(L, `cat ${log} | head -n 3 | wc -l`)).toBe("3");
    const top = run1(L, `cut -d' ' -f1 ${log} | sort | uniq -c | sort -rn | head -n 2`);
    expect(top.split("\n")).toHaveLength(2);
    expect(top).toMatch(/^ +\d+ 10\.0\./);
    const counts = top.split("\n").map((l) => Number(l.trim().split(" ")[0]));
    expect(counts[0]!).toBeGreaterThanOrEqual(counts[1]!);
    expect(run1(L, `grep -c ' 500 ' ${log}`)).toMatch(/^\d+$/);
    expect(run1(L, `awk '{print $1}' ${log} | sort -u | wc -l`)).toBe("5");
    expect(run1(L, "echo a b c | wc -w")).toBe("3");
    expect(run1(L, "echo b; echo a")).toBe("b\na");
  });

  it("sorts like sort", () => {
    const { text } = play("linux-hidden-note", ["echo 10 > n.txt", "echo 9 >> n.txt", "echo 100 >> n.txt", "sort n.txt", "sort -n n.txt", "sort -rn n.txt", "sort -n n.txt | uniq -c"]);
    expect(text[3]).toBe("10\n100\n9");
    expect(text[4]).toBe("9\n10\n100");
    expect(text[5]).toBe("100\n10\n9");
    expect(text[6]).toBe("      1 9\n      1 10\n      1 100");
  });

  it("writes files with redirects and appends", () => {
    const { text, shell } = play("linux-hidden-note", ["echo hello > a.txt", "echo again >> a.txt", "cat a.txt", "echo new > a.txt", "cat a.txt", "ls > list.txt", "cat list.txt | wc -l"]);
    expect(text[2]).toBe("hello\nagain");
    expect(text[4]).toBe("new");
    expect(Number(text[6])).toBeGreaterThan(1);
    expect(shell.st.fs.text("/home/ops/a.txt")).toBe("new\n");
    expect(run1("linux-hidden-note", "echo x > /etc/hosts")).toBe("bash: /etc/hosts: Permission denied");
    expect(run1("linux-hidden-note", "echo x > /nope/a.txt")).toBe("bash: /nope/a.txt: No such file or directory");
    expect(run1("linux-hidden-note", "ls /nope 2> err.txt; cat err.txt")).toContain("No such file or directory");
  });

  it("copies, moves, makes and removes", () => {
    const { text, shell } = play("linux-hidden-note", [
      "mkdir work", "cp app/main.py work/", "ls work", "mv work/main.py work/run.py", "ls work", "mkdir -p a/b/c", "rm work", "rm -r work", "touch x y", "rm x", "rm nothing", "rm -f nothing", "cp app work2", "cp -r app app2", "ls app2",
    ]);
    expect(text[2]).toBe("main.py");
    expect(text[4]).toBe("run.py");
    expect(text[6]).toBe("rm: cannot remove 'work': Is a directory");
    expect(text[10]).toBe("rm: cannot remove 'nothing': No such file or directory");
    expect(text[11]).toBe("");
    expect(text[12]).toBe("cp: -r not specified; omitting directory 'app'");
    expect(text[14]).toContain("main.py");
    expect(shell.st.fs.peek("/home/ops/a/b/c")).not.toBeNull();
    expect(shell.st.fs.peek("/home/ops/work")).toBeNull();
    expect(shell.st.fs.peek("/home/ops/y")).not.toBeNull();
    expect(run1("linux-hidden-note", "rm -rf /")).toContain("dangerous");
    expect(run1("linux-hidden-note", "rm /etc/hosts")).toBe("rm: cannot remove '/etc/hosts': Permission denied");
  });

  it("handles permissions: chmod, execute, denied", () => {
    const P = "linux-script-permissions";
    expect(run1(P, "./backup.sh")).toBe("bash: ./backup.sh: Permission denied");
    expect(run1(P, "ls -l backup.sh")).toContain("-rw-r--r--");
    const { text, shell } = play(P, ["chmod +x backup.sh", "ls -l backup.sh", "./backup.sh", "ls ~/backup", "chmod 600 backup.sh", "ls -l backup.sh", "chmod u+x,go-r backup.sh", "ls -l backup.sh"]);
    expect(text[1]).toContain("-rwxr-xr-x");
    expect(text[2]).toBe("Starting backup...\nBackup complete");
    expect(text[3]).toBe("notes.txt");
    expect(text[5]).toContain("-rw-------");
    expect(text[7]).toContain("-rwx------");
    expect(shell.st.executed).toEqual([{ path: "/home/ops/scripts/backup.sh", code: 0 }]);
    expect(run1(P, "chmod 755 /etc/hosts")).toBe("chmod: changing permissions of '/etc/hosts': Operation not permitted");
    expect(run1(P, "chmod 999 backup.sh")).toContain("invalid mode");
    expect(run1(P, "bash backup.sh")).toContain("Backup complete");
  });

  it("measures disk use with du and df", () => {
    const D = "linux-full-disk";
    expect(run1(D, "df -h")).toContain("97%");
    const du = run1(D, "du -sh /var/*");
    expect(du).toMatch(/^5\.\d+G\t\/var\/backups$/m);
    expect(du).toMatch(/\t\/var\/lib$/m);
    expect(du).toContain("Permission denied");
    expect(run1(D, "du -sh /var/backups")).toMatch(/^5\.\dG\t\/var\/backups$/);
    expect(run1(D, "du -h --max-depth=1 /var/cache")).toContain("/var/cache/apt");
    expect(run1(D, "du -sh /var/* 2>/dev/null | sort -h | tail -n 1")).toMatch(/\/var\/backups$/);
  });

  it("lists processes and finds them by name", () => {
    const K = "linux-runaway-process";
    const out = run1(K, "ps aux");
    expect(out).toMatch(/^USER +PID +%CPU/);
    expect(out).toContain("/opt/tools/reindex");
    expect(run1(K, "ps aux | grep reindex")).toContain("4242");
    expect(run1(K, "pgrep reindex")).toBe("4242");
    expect(play(K, ["kill $(pgrep reindex)", "pgrep reindex"]).last).toBe("4242");
    const killed = play(K, ["kill -9 $(pgrep reindex)", "pgrep reindex"]);
    expect(killed.last).toBe("");
    expect(play(K, ["pkill -9 reindex", "ps aux"]).last).not.toContain("reindex");
    expect(run1(K, "kill abc")).toContain("arguments must be process or job IDs");
  });

  it("expands variables, globs, quotes and command substitution", () => {
    const E = "linux-hidden-note";
    expect(run1(E, "echo $HOME $USER")).toBe("/home/ops ops");
    expect(run1(E, "echo '$HOME'")).toBe("$HOME");
    expect(run1(E, 'echo "a   b"')).toBe("a   b");
    expect(run1(E, "echo a   b")).toBe("a b");
    expect(run1(E, "echo ~")).toBe("/home/ops");
    expect(run1(E, "echo app/*.py")).toBe("app/main.py");
    expect(run1(E, "echo app/*.zip")).toBe("app/*.zip");
    expect(run1(E, "echo $(whoami)")).toBe("ops");
    expect(run1(E, "export NAME=Eda && echo hi $NAME")).toBe("hi Eda");
    expect(run1(E, "echo $?")).toBe("0");
    expect(run1(E, "cat app/*.md app/main.py")).toContain("orbit app starting");
  });

  it("chains with && and ||", () => {
    const E = "linux-hidden-note";
    expect(run1(E, "ls app && echo yes")).toContain("yes");
    expect(run1(E, "ls nope && echo yes")).not.toContain("yes");
    expect(run1(E, "ls nope || echo recovered")).toContain("recovered");
    expect(run1(E, "ls nope 2>/dev/null || echo recovered")).toBe("recovered");
    expect(run1(E, "false || true && echo ok")).toBe("ok");
  });

  it("says command not found, and explains what is missing", () => {
    expect(run1("linux-hidden-note", "foobar")).toBe("bash: foobar: command not found");
    expect(run1("linux-hidden-note", "nano x")).toContain("not available on this practice server");
    expect(run1("linux-hidden-note", "sudo ls")).toContain("sudoers");
    expect(run1("linux-hidden-note", "ls -z")).toContain("invalid option -- 'z'");
    expect(run1("linux-hidden-note", "echo 'open")).toContain("unexpected EOF");
    expect(run1("linux-hidden-note", "ls | | wc")).toContain("syntax error");
    expect(run1("linux-hidden-note", "ls &")).toContain("background");
  });

  it("whoami, id, which, history, help, man, clear", () => {
    const E = "linux-hidden-note";
    expect(run1(E, "whoami")).toBe("ops");
    expect(run1(E, "id")).toContain("uid=1000(ops)");
    expect(run1(E, "which ls")).toBe("/usr/bin/ls");
    expect(play(E, ["pwd", "ls", "history"]).last).toContain("3  history");
    expect(run1(E, "help")).toContain("grep");
    expect(run1(E, "commands")).toContain("find");
    expect(run1(E, "man grep")).toContain("Usage: grep");
    expect(run1(E, "man zzz")).toContain("No manual entry");
    expect(run1(E, "grep --help")).toContain("Usage: grep");
    const shell = new Shell(missionById(E)!);
    shell.run("ls");
    expect(shell.run("clear").clear).toBe(true);
  });

  it("counts hints and commands (help, hint, history, clear and man are free)", () => {
    const shell = new Shell(missionById("linux-hidden-note")!);
    expect(shell.run("hint").lines[0]!.text).toMatch(/^Hint 1 of 3:/);
    shell.run("help");
    shell.run("history");
    shell.run("clear");
    shell.run("man ls");
    expect(shell.commandCount).toBe(0);
    expect(shell.hintCount).toBe(1);
    shell.run("ls");
    expect(shell.commandCount).toBe(1);
    shell.run("hint");
    shell.run("hint");
    expect(shell.run("hint").lines[0]!.text).toContain("No more hints");
    expect(shell.hintCount).toBe(3);
  });

  it("gives stars by commands and hints", () => {
    const m = missionById("linux-hidden-note")!;
    const r = { ...linuxEngine.roundsFor("2026-11-18")[0]!, id: m.id };
    const slow = [...m.solution.slice(0, 2), "pwd", "pwd", "pwd", "pwd", ...m.solution.slice(2)];
    expect(linuxEngine.verify(r, { commands: m.solution, hints: 0 }).stars).toBe(3);
    expect(linuxEngine.verify(r, { commands: ["hint", ...m.solution], hints: 0 }).stars).toBe(2);
    expect(linuxEngine.verify(r, { commands: ["hint", "hint", ...m.solution], hints: 0 }).stars).toBe(1);
    expect(linuxEngine.verify(r, { commands: m.solution, hints: 2 }).stars).toBe(1);
    expect(linuxEngine.verify(r, { commands: ["ls", ...m.solution], hints: 0 }).stars).toBe(2);
    expect(linuxEngine.verify(r, { commands: slow, hints: 0 }).stars).toBe(2);
    expect(linuxEngine.verify(r, { commands: [...slow, "ls"], hints: 0 }).stars).toBe(2);
    expect(linuxEngine.verify(r, { commands: ["pwd", "pwd", "pwd", "pwd", "pwd", "pwd", ...m.solution], hints: 0 }).stars).toBe(1);
  });

  it("matches patterns without backtracking trouble", () => {
    const m = compilePatterns(["(a+)+b"], { ere: true, ignoreCase: false });
    expect("error" in m).toBe(false);
    if (!("error" in m)) {
      const start = Date.now();
      expect(m.test("a".repeat(400))).toBe(false);
      expect(Date.now() - start).toBeLessThan(2000);
      expect(m.test("aaab")).toBe(true);
    }
    expect(globMatch("*.log", "a.log")).toBe(true);
    expect(globMatch("a?c", "abc")).toBe(true);
    expect(globMatch("[a-c]x", "bx")).toBe(true);
    expect(globMatch("*a*a*a*b", "a".repeat(200))).toBe(false);
    expect("error" in compilePatterns(["(unclosed"], { ere: true, ignoreCase: false })).toBe(true);
    expect("error" in compilePatterns(["[abc"], { ere: false, ignoreCase: false })).toBe(true);
  });
});

describe("submissions", () => {
  const good: LinuxSubmission = { commands: ["ls", "pwd"], hints: 0 };

  it("parseSubmission accepts a well formed submission", () => {
    expect(linuxEngine.parseSubmission(good)).toEqual(good);
    expect(linuxEngine.parseSubmission({ commands: [], hints: 0 })).toEqual({ commands: [], hints: 0 });
  });

  it("parseSubmission rejects junk", () => {
    const junk: unknown[] = [
      null, undefined, 0, "ls", [], [["ls"]], {}, { commands: "ls", hints: 0 }, { commands: ["ls"] }, { commands: ["ls"], hints: -1 },
      { commands: ["ls"], hints: 1.5 }, { commands: ["ls"], hints: "0" }, { commands: ["ls"], hints: 99 }, { commands: [1, 2], hints: 0 },
      { commands: [null], hints: 0 }, { commands: ["x".repeat(501)], hints: 0 }, { commands: Array(251).fill("ls"), hints: 0 },
      { commands: ["ls\nrm -rf x"], hints: 0 }, { commands: ["ls\u0000"], hints: 0 }, { commands: ["ls"], hints: 0, extra: true },
      { done: true }, { commands: { length: 1, 0: "ls" }, hints: 0 },
    ];
    for (const j of junk) expect(linuxEngine.parseSubmission(j)).toBeNull();
  });

  it("verify never throws on odd input", () => {
    const r = linuxEngine.roundsFor("2026-11-18")[2]!;
    const odd: string[] = [
      "x".repeat(5000), "x".repeat(500), "\u0000\u0001", "💥🔥 ünï", "$(" + "$(".repeat(30), "echo $(echo $(echo $(echo $(echo hi))))",
      "((((((((", "\\", "'", '"', "`", "| | |", "&&", ">>", "> ", "2>&1", "ls " + "../".repeat(200), "cat " + "a/".repeat(300), "grep -E '(((((((a' x", "grep '[' x", "find / -exec", "find / -exec ls",
      "find / -name", "sed s/a/b", "sed -i", "awk", "awk '{", "sort -k", "cut", "cut -d", "head -n x", "tail -n", "kill", "kill -", "chmod", "chmod +x", "cp", "mv a", "xargs", "wc -z", "ls -R /", "du -ah /",
      "find / -type f | xargs cat | sort | uniq -c | sort -rn | head", "echo * * * * *", "echo ?????????? [[[[", "cat /dev/null", "yes", "rm -rf *", "rm -rf /home", "cd ../../../../..", "echo $HOME$HOME$HOME > /tmp/" + "a".repeat(300),
      "ls /*/*/*/*", "grep -r . /", "cat /etc/passwd | cat | cat | cat", "history", "hint", "submit", "submit " + "9".repeat(400), "man", "bash", "bash x", "./nope", "/bin/ls", "FOO=bar", "FOO=bar ls",
    ];
    for (const m of MISSIONS) {
      const target = { ...r, id: m.id };
      expect(() => linuxEngine.verify(target, { commands: odd, hints: 0 })).not.toThrow();
      const res = linuxEngine.verify(target, { commands: odd, hints: 0 });
      expect(typeof res.message).toBe("string");
      expect(res.stars).toBeGreaterThanOrEqual(0);
    }
    expect(() => linuxEngine.verify({ ...r, id: "does-not-exist" }, good)).not.toThrow();
    expect(linuxEngine.verify({ ...r, id: "does-not-exist" }, good).passed).toBe(false);
    expect(() => linuxEngine.verify(null as never, null as never)).not.toThrow();
    expect(() => linuxEngine.verify({} as never, { commands: [5 as never], hints: 0 })).not.toThrow();
  });

  it("keeps long and fast runs bounded", () => {
    const start = Date.now();
    const cmds = Array(200).fill("cat /etc/passwd /etc/passwd /etc/passwd | grep -E '(a|b)*c' | sort | uniq -c");
    cmds.push("echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa > big", ...Array(30).fill("cat big big big big big big big big >> big"));
    const r = linuxEngine.verify({ ...linuxEngine.roundsFor("2026-11-18")[0]!, id: "linux-hidden-note" }, { commands: cmds.slice(0, 250), hints: 0 });
    expect(r.passed).toBe(false);
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it("is a replay: the same commands always give the same result", () => {
    const m = MISSIONS[0]!;
    const sub = { commands: [...m.solution], hints: 0 };
    const r = linuxEngine.roundsFor("2026-11-18")[0]!;
    const a = linuxEngine.verify({ ...r, id: m.id }, sub);
    const b = linuxEngine.verify({ ...r, id: m.id }, sub);
    expect(a).toEqual(b);
  });
});

describe("daily rotation", () => {
  it("returns one mission per difficulty, in order, with plain JSON round data", () => {
    const rounds = linuxEngine.roundsFor("2026-11-18");
    expect(rounds.map((r) => r.difficulty)).toEqual([...DIFFICULTIES]);
    for (const r of rounds) {
      expect(JSON.parse(JSON.stringify(r))).toEqual(r);
      expect(missionById(r.id)).not.toBeNull();
      expect(r.objectives.length).toBeGreaterThanOrEqual(3);
      expect(["answer", "state"]).toContain(r.kind);
    }
  });

  it("is the same for everyone on one day and varies by day", () => {
    expect(linuxEngine.roundsFor("2026-11-18")).toEqual(linuxEngine.roundsFor("2026-11-18"));
    const ids = (d: string) => linuxEngine.roundsFor(d).map((r) => r.id).join();
    expect(ids("2026-11-18")).not.toBe(ids("2026-11-19"));
    const seen = new Set<string>();
    for (let d = 1; d <= 6; d++) for (const r of linuxEngine.roundsFor(`2026-12-${String(d).padStart(2, "0")}`)) seen.add(r.id);
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it("builds a session for a known round only", () => {
    expect(createLinuxSession(linuxEngine.roundsFor("2026-11-18")[0]!)).not.toBeNull();
    expect(createLinuxSession({ id: "nope" })).toBeNull();
  });

  it("uses plain text with no dashes in titles and briefs", () => {
    for (const r of MISSIONS) expect(`${r.title} ${r.brief}`).not.toMatch(/[–—]/);
  });

  it("round helper is available", () => {
    expect(round("linux-hidden-note").id).toBe("linux-hidden-note");
  });
});
