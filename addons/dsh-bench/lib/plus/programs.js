/**
 * Every program a Bench tool may run (the first Bench tools and lib/plus), where each one is looked for,
 * which tools use it, and the exact command the user can install it with. Bench never installs anything:
 * a missing program is named with its command, and the user runs it.
 *
 * `findPlus` follows lib/run.js `findProgram`: the fixed places first, then the folders of the user's own
 * shell PATH, and only a file that exists and may be run counts.
 */
import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { userPathFolders } from '../run.js';

/** The Bench folder when the caller gives none (the app's default; the tools pass the folder in use). */
export const DEFAULT_BENCH = join(homedir(), '.dsh', 'bench');
const BREW = ['/opt/homebrew/bin', '/usr/local/bin'];
const LOCAL = join(homedir(), '.local', 'bin');
const HOME_BENCH = '~/.dsh/bench';

/** The place shown in an install command: `~/.dsh/bench`, or the Bench folder in use. */
const shownBench = (bench) => (!bench || bench === DEFAULT_BENCH ? HOME_BENCH : `"${bench}"`);

const macos = (name, folder, used) => ({ names: [name], places: [folder], builtIn: true, noPath: true, used, install: `${name} is part of macOS; it is missing from ${folder}.` });
const brew = (names, formula, used, extra = []) => ({ names, places: [...BREW, ...extra], used, install: `brew install ${formula}` });

/**
 * The programs. `places` may depend on the Bench folder (a helper the user built into <Bench folder>/bin,
 * or the Python made for the instrument library in <Bench folder>/venv); `noPath` keeps the search to
 * those places; `bench` says which Bench subfolder is looked in first.
 */
export const PLUS_PROGRAMS = {
  // Part of macOS.
  ssh: macos('ssh', '/usr/bin', 'bench_router, bench_server, bench_net_flow (router), bench_monitor (router)'),
  'ssh-keygen': macos('ssh-keygen', '/usr/bin', 'bench_router, bench_server (Bench\'s own key)'),
  'ssh-keyscan': macos('ssh-keyscan', '/usr/bin', 'bench_router, bench_server (the host\'s key)'),
  security: macos('security', '/usr/bin', 'bench_router, bench_server (saved passwords, in the keychain)'),
  system_profiler: macos('system_profiler', '/usr/sbin', 'bench_bluetooth, bench_usb_info, bench_ftdi, bench_ch340, bench_battery'),
  ioreg: macos('ioreg', '/usr/sbin', 'bench_usb, bench_usb_info, bench_ftdi, bench_ch340, bench_battery, bench_hid_watch, bench_monitor (hid)'),
  stty: macos('stty', '/bin', 'bench_serial_watch, bench_serial_send, bench_obd, bench_ch340 (baud-test), bench_monitor (serial, obd)'),
  cat: macos('cat', '/bin', 'bench_serial_watch, bench_serial_send, bench_obd, bench_ch340 (baud-test), bench_monitor (serial, obd)'),
  'dns-sd': macos('dns-sd', '/usr/bin', 'bench_network'),
  ipconfig: macos('ipconfig', '/usr/sbin', 'bench_network'),
  arp: macos('arp', '/usr/sbin', 'bench_network'),
  dscacheutil: macos('dscacheutil', '/usr/bin', 'bench_network'),
  pmset: macos('pmset', '/usr/bin', 'bench_battery, the power check before a write'),
  hidutil: macos('hidutil', '/usr/bin', 'bench_hid'),
  netstat: macos('netstat', '/usr/sbin', 'bench_net_flow, bench_monitor (netif)'),
  lsof: macos('lsof', '/usr/sbin', 'bench_net_flow (connections)'),
  tcpdump: macos('tcpdump', '/usr/sbin', 'bench_netprobe (when tshark is missing)'),
  unzip: macos('unzip', '/usr/bin', 'bench_firmware'),
  xcrun: { ...macos('xcrun', '/usr/bin', 'bench_bluetooth (builds its helper)'), install: 'xcode-select --install (Apple\'s Command Line Tools)' },

  // The first Bench tools.
  esptool: { ...brew(['esptool.py', 'esptool'], 'esptool', 'bench_esp32', [LOCAL, join(homedir(), 'Library', 'Python', '3.12', 'bin'), join(homedir(), 'Library', 'Python', '3.11', 'bin')]), install: 'brew install esptool (or pipx install esptool)' },
  adb: { ...brew(['adb'], '--cask android-platform-tools', 'bench_android, bench_phone', [join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools')]) },
  fastboot: { ...brew(['fastboot'], '--cask android-platform-tools', 'bench_android, bench_phone', [join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools')]) },

  // lib/plus.
  idevice_id: brew(['idevice_id'], 'libimobiledevice', 'bench_ios (list)'),
  ideviceinfo: brew(['ideviceinfo'], 'libimobiledevice', 'bench_ios (info)'),
  idevicepair: brew(['idevicepair'], 'libimobiledevice', 'bench_ios (pair, unpair)'),
  avrdude: brew(['avrdude'], 'avrdude', 'bench_arduino'),
  picotool: brew(['picotool'], 'picotool', 'bench_rp2040'),
  'st-info': brew(['st-info'], 'stlink', 'bench_stm32 (info)'),
  'st-flash': brew(['st-flash'], 'stlink', 'bench_stm32 (read, write, verify, erase)'),
  openocd: brew(['openocd'], 'open-ocd', 'bench_openocd, bench_fpga'),
  JLinkExe: { names: ['JLinkExe'], places: [...BREW, '/Applications/SEGGER/JLink'], used: 'bench_jlink', install: 'brew install --cask segger-jlink (SEGGER\'s J-Link Software and Documentation Pack; you accept SEGGER\'s terms yourself)' },
  nmap: brew(['nmap'], 'nmap', 'bench_net_scan'),
  tshark: brew(['tshark'], 'wireshark', 'bench_netprobe', ['/Applications/Wireshark.app/Contents/MacOS']),
  lsusb: brew(['lsusb'], 'usbutils', 'bench_usb_info, bench_ftdi, bench_ch340 (without it they read the Mac\'s own list)'),
  ftdi_eeprom: brew(['ftdi_eeprom'], 'libftdi', 'bench_ftdi (eeprom-read)'),
  pcsc_scan: brew(['pcsc_scan'], 'pcsc-tools', 'bench_smartcard (list-readers, read-atr)'),
  scriptor: brew(['scriptor'], 'pcsc-tools', 'bench_smartcard (apdu)'),
  'nfc-scan-device': brew(['nfc-scan-device'], 'libnfc', 'bench_nfc (detect, info)'),
  'nfc-list': brew(['nfc-list'], 'libnfc', 'bench_nfc (list, info, read all)'),
  'nfc-poll': brew(['nfc-poll'], 'libnfc', 'bench_nfc (detect)'),
  'nfc-mfclassic': brew(['nfc-mfclassic'], 'libnfc', 'bench_nfc (read mifare)'),
  'nfc-mfultralight': brew(['nfc-mfultralight'], 'libnfc', 'bench_nfc (read ntag, ndef)'),
  python3: {
    names: ['python3'],
    places: (bench) => [join(bench, 'venv', 'bin'), ...BREW],
    bench: 'venv',
    // /usr/bin/python3 is a stub that may open an installer window: never looked for.
    noPath: true,
    used: 'bench_usb_tmc (PyVISA)',
    install: (bench) => `brew install python, then the instrument library: python3 -m venv ${shownBench(bench)}/venv && ${shownBench(bench)}/venv/bin/python -m pip install pyvisa pyvisa-py pyusb (and brew install libusb for USB instruments)`,
  },
  moria: {
    names: ['moria'],
    places: (bench) => [join(bench, 'bin'), ...BREW, LOCAL],
    bench: 'bin',
    used: 'bench_firmware_extract',
    install: (bench) => `build moria from https://github.com/nmatt0/moria (brew install cmake zlib xz lz4 zstd; git clone https://github.com/nmatt0/moria.git; cmake -S moria -B moria/build -DCMAKE_BUILD_TYPE=Release; cmake --build moria/build -j) and copy moria/build/moria to ${shownBench(bench)}/bin/moria`,
  },
  'usb-rea': {
    names: ['usb-rea'],
    places: (bench) => [join(bench, 'bin'), ...BREW, LOCAL],
    bench: 'bin',
    used: 'bench_usb_protocol',
    install: 'brew install pipx && pipx ensurepath && pipx install usb-rea',
  },
  'hid-capture': {
    names: ['hid-capture'],
    places: (bench) => [join(bench, 'bin'), ...BREW],
    bench: 'bin',
    noPath: true,
    used: 'bench_hid_capture',
    install: (bench) => `mkdir -p ${shownBench(bench)}/bin && swiftc -O "${hidCaptureSource()}" -o ${shownBench(bench)}/bin/hid-capture -framework IOKit -framework Foundation`,
  },
};

/** Where the hid-capture helper's source is: next to this file, wherever the add-on is installed. */
export function hidCaptureSource() {
  try {
    return decodeURIComponent(new URL('./hid-capture.swift', import.meta.url).pathname);
  } catch {
    return 'lib/plus/hid-capture.swift';
  }
}

/** @returns {string[]} the fixed places of a program, for a Bench folder. */
export function placesOf(id, bench = DEFAULT_BENCH) {
  const program = PLUS_PROGRAMS[id];
  if (!program) return [];
  return typeof program.places === 'function' ? program.places(bench || DEFAULT_BENCH) : [...program.places];
}

/** @returns {string} the command that installs a program (what the user runs; Bench never does). */
export function installOf(id, bench = DEFAULT_BENCH) {
  const program = PLUS_PROGRAMS[id];
  if (!program) return '';
  return typeof program.install === 'function' ? program.install(bench || DEFAULT_BENCH) : program.install;
}

/** A plain file that may be run (a folder may be "run" too, so it is checked to be a file). */
export function runnable(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a program in its fixed places, then in the user's PATH (as lib/run.js `findProgram`).
 * @param {string} id - a key of PLUS_PROGRAMS.
 * @param {{places?: string[], pathFolders?: () => Promise<string[]>, benchFolder?: string}} [options] - stand-ins for tests, and the Bench folder in use.
 * @returns {Promise<string>} its full path, or '' when it is not there.
 */
export async function findPlus(id, { places, pathFolders = userPathFolders, benchFolder = DEFAULT_BENCH } = {}) {
  const program = PLUS_PROGRAMS[id];
  if (!program) return '';
  const folders = places ?? placesOf(id, benchFolder);
  for (const folder of folders) for (const name of program.names) if (runnable(join(folder, name))) return join(folder, name);
  if (places || program.noPath) return '';
  let more = [];
  try {
    more = await pathFolders();
  } catch {
    more = [];
  }
  for (const folder of more) for (const name of program.names) if (runnable(join(folder, name))) return join(folder, name);
  return '';
}
