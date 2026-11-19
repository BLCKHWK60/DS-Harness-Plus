/**
 * The server recipe (plan B8): the owner's Windows home server (a LincStation N1 with Windows IoT),
 * reached with Windows' own SSH server and his account. Every command is a fixed PowerShell script Bench
 * builds, sent as `powershell -NoProfile -NonInteractive -EncodedCommand <base64>`, so nothing in it is
 * read by a shell on the way. Answers come back as JSON.
 * - Read: the system and its version, uptime, services, pending updates, recent errors, disk space.
 * - Adjust with undo: start or stop a service the owner names in his own message, or set how it starts;
 *   never the services that keep Windows (and Bench's own way in) running, never the system drive, never
 *   his files. A restore point comes first; when Windows cannot make one, the owner is told and asked.
 * - Its BIOS is updated only with the maker's own tool: Bench does nothing there.
 */
import { clean } from './usb.js';
import { mask } from './cards.js';

/** A service's name as Windows writes it. */
export const SERVICE = /^[A-Za-z0-9_.-]{1,80}$/;
/**
 * Services Bench never stops or changes: Windows needs them, or they are Bench's own way in (SSH, WinRM,
 * networking, Wi-Fi). Windows Update and BITS are not on it (the owner's choice): like any other service,
 * only when the owner names them, after a restore point, with undo.
 */
export const SERVICE_NEVER = /^(sshd|ssh-agent|winrm|rpcss|rpceptmapper|dcomlaunch|lsm|samss|eventlog|winmgmt|bfe|mpssvc|windefend|wscsvc|cryptsvc|plugplay|power|profsvc|schedule|termservice|dhcp|dnscache|nsi|netman|netprofm|nlasvc|lanmanserver|lanmanworkstation|gpsvc|trustedinstaller|vss|swprv|srservice|wdnissvc|sense|sgrmbroker|systemeventsbroker|brokerinfrastructure|coremessagingregistrar|audiosrv|wlansvc|wcmsvc)$/i;
export const STARTUP = ['Automatic', 'Manual', 'Disabled'];

/** PowerShell scripts, fixed text; a service's name is checked and put in single quotes. */
const psq = (value) => `'${String(value).replace(/'/g, "''")}'`;
export const SCRIPTS = {
  info: "$o=Get-CimInstance Win32_OperatingSystem; $c=Get-CimInstance Win32_ComputerSystem; [pscustomobject]@{name=$env:COMPUTERNAME; system=$o.Caption; version=$o.Version; build=$o.BuildNumber; booted=$o.LastBootUpTime.ToString('s'); model=$c.Model; maker=$c.Manufacturer; memoryGB=[math]::Round($c.TotalPhysicalMemory/1GB,1)} | ConvertTo-Json -Compress",
  services: 'Get-Service | Select-Object Name,DisplayName,@{n="Status";e={"$($_.Status)"}},@{n="StartType";e={"$($_.StartType)"}} | ConvertTo-Json -Compress',
  updates: "try { $s=(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); $r=$s.Search('IsInstalled=0 and IsHidden=0'); @($r.Updates | ForEach-Object { [pscustomobject]@{title=$_.Title; kb=($_.KBArticleIDs -join ','); size=$_.MaxDownloadSize} }) | ConvertTo-Json -Compress } catch { [pscustomobject]@{error=$_.Exception.Message} | ConvertTo-Json -Compress }",
  events: "@(Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=1,2} -MaxEvents 30 -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{at=$_.TimeCreated.ToString('s'); log=$_.LogName; source=$_.ProviderName; id=$_.Id; text=($_.Message -replace '\\s+',' ').Substring(0,[math]::Min(300,($_.Message -replace '\\s+',' ').Length))} }) | ConvertTo-Json -Compress",
  disks: '@(Get-PSDrive -PSProvider FileSystem | ForEach-Object { [pscustomobject]@{drive=$_.Name; usedGB=[math]::Round($_.Used/1GB,1); freeGB=[math]::Round($_.Free/1GB,1)} }) | ConvertTo-Json -Compress',
  restorePoint: "try { Checkpoint-Computer -Description 'DeepSeek Harness Bench' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop; 'BENCH-OK' } catch { 'BENCH-NO: ' + $_.Exception.Message }",
  service: (name) => `$s=Get-Service -Name ${psq(name)} -ErrorAction Stop; [pscustomobject]@{name=$s.Name; status="$($s.Status)"; startType="$($s.StartType)"} | ConvertTo-Json -Compress`,
  start: (name) => `Start-Service -Name ${psq(name)} -ErrorAction Stop; 'BENCH-OK'`,
  stop: (name) => `Stop-Service -Name ${psq(name)} -ErrorAction Stop; 'BENCH-OK'`,
  restart: (name) => `Restart-Service -Name ${psq(name)} -Force -ErrorAction Stop; 'BENCH-OK'`,
  startup: (name, type) => {
    if (!STARTUP.includes(String(type))) throw new Error('not a startup type');
    return `Set-Service -Name ${psq(name)} -StartupType ${psq(type)} -ErrorAction Stop; 'BENCH-OK'`;
  },
};

/** The command line sent over SSH: PowerShell with the script encoded, never read by a shell. */
export function powershellCommand(script) {
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
}

/** @returns {unknown} the JSON a script printed, or undefined. */
export function jsonOf(text) {
  const value = String(text ?? '').replace(/^﻿/, '').trim();
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** A value from the server, as it is shown: cleaned and masked (material, not instructions). */
export const shown = (value, max = 160) => mask(clean(String(value ?? ''), max));

/**
 * @param {string} name - the service.
 * @param {string} said - the user's own latest message.
 * @param {{risky?: boolean}} [options] - the owner's "Allow risky writes" switch: then any service, without
 *   naming it in their own message.
 * @returns {string} why a service may not be changed, or ''.
 */
export function serviceRefusal(name, said, { risky = false } = {}) {
  const text = String(name ?? '');
  if (!SERVICE.test(text)) return 'Give the service\'s name as Windows writes it (letters, digits, . _ -).';
  if (risky) return '';
  if (SERVICE_NEVER.test(text)) return `${text} keeps Windows running, protects it or is Devices' own way in (SSH); Devices never stops or changes it.`;
  const words = String(said ?? '').toLowerCase().split(/[\s,;:!?()"'\u2018\u2019\u201c\u201d]+/).map((word) => word.replace(/\.+$/, ''));
  if (!words.includes(text.toLowerCase())) return `Devices changes a service only when you name it in your own message. Ask the user to write its name (${text}).`;
  return '';
}
