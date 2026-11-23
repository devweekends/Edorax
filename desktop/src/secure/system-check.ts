import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const VM_MARKERS =
  /\b(vmware|virtualbox|vbox|innotek|qemu|kvm|xen|parallels|bochs|bhyve|hyper-v|virtual machine)\b/i;

/** True when a hardware vendor, model or product string names a hypervisor. Pure, so it is tested. */
export function looksVirtual(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => Boolean(value && VM_MARKERS.test(value)));
}

async function run(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    timeout: 8_000,
    windowsHide: true,
  });
  return stdout.trim();
}

/**
 * Is the exam running inside a virtual machine? It reads the computer's own vendor and model
 * strings, so a real PC that merely has Hyper-V or WSL switched on is not flagged. When a
 * check cannot run, the answer is "no": we never block a learner on a guess.
 */
export async function detectVirtualMachine(): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const json = await run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress',
      ]);
      const system = JSON.parse(json) as { Manufacturer?: string; Model?: string };
      return looksVirtual(system.Manufacturer, system.Model);
    }
    if (process.platform === 'darwin') {
      // 1 inside any virtual machine on macOS 11 and later, including Apple Silicon.
      if ((await run('sysctl', ['-n', 'kern.hv_vmm_present'])) === '1') return true;
      return looksVirtual(await run('sysctl', ['-n', 'hw.model']));
    }
    const [product, vendor] = await Promise.all([
      readFile('/sys/class/dmi/id/product_name', 'utf8').catch(() => ''),
      readFile('/sys/class/dmi/id/sys_vendor', 'utf8').catch(() => ''),
    ]);
    return looksVirtual(product, vendor);
  } catch {
    return false;
  }
}
