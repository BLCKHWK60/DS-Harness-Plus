/**
 * Which programs Bench's tools can use, which are on this Mac, and the exact command for each one that is
 * missing. Bench never installs anything: the user runs the commands.
 */
import { NEVER_INSTALLS, locate } from './core.js';
import { DEFAULT_BENCH, PLUS_PROGRAMS, hidCaptureSource, installOf } from './programs.js';

const benchOf = (deps) => {
  try {
    const folder = deps?.benchFolder?.();
    return typeof folder === 'string' && folder.startsWith('/') ? folder : DEFAULT_BENCH;
  } catch {
    return DEFAULT_BENCH;
  }
};

/**
 * One row per program any Bench tool can use.
 * @returns {Promise<{name: string, used: string, builtIn: boolean, found: boolean, path: string|null, install: string|null}[]>} the rows (install is null when found).
 */
export async function requirementRows(deps) {
  const bench = benchOf(deps);
  return Promise.all(Object.entries(PLUS_PROGRAMS).map(async ([id, program]) => {
    let path = '';
    try {
      path = await locate(deps, id);
    } catch {
      path = '';
    }
    return { name: id, used: program.used, builtIn: Boolean(program.builtIn), found: Boolean(path), path: path || null, install: path ? null : installOf(id, bench) };
  }));
}

/** The text bench_requirements returns. */
export function formatRequirements(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ready = list.filter((row) => row.found);
  const missing = list.filter((row) => !row.found);
  const lines = [`Ready (${ready.length}):`];
  for (const row of ready) lines.push(`- ${row.name}: ${row.path}${row.builtIn ? ' (part of macOS)' : ''}`);
  if (ready.length === 0) lines.push('- none');
  lines.push('', `Missing (${missing.length}):`);
  if (missing.length === 0) lines.push('- nothing: every program is installed.');
  for (const row of missing) lines.push(`- ${row.name}, for ${row.used}`, `    install: ${row.install}`);
  lines.push('', `${NEVER_INSTALLS} Run the commands above yourself in Terminal, then ask for bench_requirements again. Packet capture, instruments, moria, usb-rea, J-Link and the HID helper have more steps on Settings → Devices.`);
  return lines.join('\n');
}

/** Plain texts for Settings → Bench: what to install, and the steps that need more than one command. */
export const INSTALL_TEXT = {
  brew: [
    'brew install libimobiledevice avrdude picotool stlink open-ocd nmap wireshark usbutils libftdi libnfc pcsc-tools esptool',
    'brew install --cask android-platform-tools',
  ].join('\n'),
  capture: [
    'Packet capture (bench_netprobe) needs permission to read the network devices (/dev/bpf*). Wireshark\'s ChmodBPF helper gives it to your user:',
    'brew install --cask wireshark-chmodbpf',
    'then log out and back in, and check with: tshark -D',
    'Without the helper, until the next restart: sudo chmod 666 /dev/bpf*',
    'A phone or TV on Wi-Fi is usually invisible from the Mac (the access point switches its traffic): capture on the router instead.',
    'Devices never asks for root and never installs anything.',
  ].join('\n'),
  pyvisa: [
    'Instruments (bench_usb_tmc) use PyVISA in a Python of their own, which Devices looks for first:',
    'python3 -m venv ~/.dsh/bench/venv',
    '~/.dsh/bench/venv/bin/python -m pip install pyvisa pyvisa-py pyusb',
    'brew install libusb   (for USB instruments through pyvisa-py; NI-VISA works too)',
  ].join('\n'),
  moria: [
    'Firmware extraction (bench_firmware_extract) uses moria (https://github.com/nmatt0/moria, MIT). Build it once:',
    'brew install cmake zlib xz lz4 zstd',
    'git clone https://github.com/nmatt0/moria.git',
    'cmake -S moria -B moria/build -DCMAKE_BUILD_TYPE=Release',
    'cmake --build moria/build -j',
    'mkdir -p ~/.dsh/bench/bin && cp moria/build/moria ~/.dsh/bench/bin/moria',
  ].join('\n'),
  usbRea: [
    'USB protocol inference (bench_usb_protocol) uses usb-rea (https://github.com/emirmrkaljevic/usb-rea, MIT):',
    'brew install pipx && pipx ensurepath',
    'pipx install usb-rea',
    'It reads a capture made on Linux (usbmon) or Windows (USBPcap): macOS cannot capture USB traffic itself.',
  ].join('\n'),
  hidCapture: [
    'Raw HID capture (bench_hid_capture) uses a small helper you build once (Xcode or the Command Line Tools):',
    'mkdir -p ~/.dsh/bench/bin',
    `swiftc -O "${hidCaptureSource()}" -o ~/.dsh/bench/bin/hid-capture -framework IOKit -framework Foundation`,
    'Then allow Input Monitoring for DeepSeek Harness (System Settings → Privacy & Security → Input Monitoring). It records keys pressed while it runs.',
  ].join('\n'),
  jlink: [
    'J-Link (bench_jlink) needs SEGGER\'s J-Link Software and Documentation Pack: brew install --cask segger-jlink, or the download at https://www.segger.com/downloads/jlink/.',
    'You accept SEGGER\'s terms during that install. Devices runs JLinkExe with a command file it writes itself (connect, mem32, regs, r, exit).',
  ].join('\n'),
  never: `${NEVER_INSTALLS} Run these commands yourself in Terminal; bench_requirements then shows what is ready.`,
};
