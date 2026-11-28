// What the browser runtime does to a new machine before the lab's own setup runs.
// The lab verifier (scripts/browser-lab-verify.mjs) imports this file under Node, so it must
// stay plain: no browser APIs and only type syntax that Node can strip.

/**
 * Makes the Debian machine look like the lab's own server, which the desktop app starts from a
 * bare Ubuntu container: its hostname, the usual `root@host:~#` prompt, no automatic package
 * install for unknown commands (the lab has no network, so it would only hang), no services
 * running yet (Debian starts cron and dnsmasq at boot, a container starts nothing; the lab's
 * setup starts what it needs), no message of the day file, and the same small /tmp the desktop
 * app gives a machine (32 MB in memory), which the disk labs fill on purpose.
 */
export function prepareScript(machineName: string): string {
  const name = machineName.replace(/[^a-zA-Z0-9-]/g, "") || "lab";
  return [
    `hostname ${name}`,
    `echo ${name} > /etc/hostname`,
    `grep -q " ${name}$" /etc/hosts || echo "127.0.1.1 ${name}" >> /etc/hosts`,
    "mount -t tmpfs -o rw,exec,nosuid,size=32m tmpfs /tmp",
    "for name in cron dnsmasq sshd; do pkill -x $name; done",
    "sleep 0.3; rm -f /run/crond.pid /run/dnsmasq/dnsmasq.pid /run/sshd.pid /etc/motd",
    `printf '%s\\n' 'export KW_AUTO_APT=0' "PS1='\\u@\\h:\\w\\\\$ '" > /etc/profile.d/zz-edorax-lab.sh`,
  ].join("\n");
}

/** Base64 of a text, in the browser and in Node. */
export function base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** One bash that runs `script` exactly as written, whatever quotes it holds. */
export function wrapped(script: string): string {
  return `bash -c "$(printf %s '${base64(script)}' | base64 -d)"`;
}
