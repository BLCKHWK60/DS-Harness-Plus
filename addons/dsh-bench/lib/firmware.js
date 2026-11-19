/**
 * Bench downloads a firmware file itself (the owner's choice, 16 November 2026): only from a source on
 * the list (the maker's or an official project's, or one the owner added on Settings → Bench), only
 * after the owner's yes, every step of the way checked like the checksum page, at most FIRMWARE_MAX
 * bytes, into the device's firmware folder. The file is kept only when its SHA-256 is published on the
 * maker's page, which Bench reads itself; otherwise Bench's own unfinished download is removed.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants as fsConstants, linkSync, openSync, rmSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { stepRefusal } from './esp32.js';

/** The largest file Bench downloads (the owner's choice: 8 GB; a phone's factory image is about 3 GB). */
export const FIRMWARE_MAX = 8 * 1024 * 1024 * 1024;
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

/** @returns {string} the file's name in the firmware folder: the one given, or the address's own. */
export function firmwareName(url, given) {
  const name = String(given ?? '').trim() || decodeURIComponent(basename(new URL(url).pathname));
  if (!FILE_NAME.test(name)) throw new Error('Give the file a plain name (letters, digits, . _ -), such as gl-be3600-4.7.0.bin.');
  return name;
}

/**
 * Download one file into a folder, under a name of Bench's own until it is checked.
 * @param {{url: string, folder: string, fetchFn?: typeof fetch, extra?: object[], max?: number, timeoutMs?: number, signal?: AbortSignal}} job - what to fetch, and where.
 * @returns {Promise<{temp: string, sum: string, bytes: number, from: string}>} the unchecked file.
 */
export async function download({ url, folder, fetchFn = globalThis.fetch, extra = [], kind, max = FIRMWARE_MAX, timeoutMs = 30 * 60_000, signal }) {
  if (typeof fetchFn !== 'function') throw new Error('Devices cannot reach the web here.');
  let at = new URL(String(url ?? ''));
  let response;
  for (let step = 0; ; step += 1) {
    if (step > 5) throw new Error('the address sent Devices elsewhere too many times');
    const refused = stepRefusal(at, step === 0, extra, kind);
    if (refused) throw new Error(`${at.hostname}: ${refused}`);
    const limit = AbortSignal.timeout(timeoutMs);
    response = await fetchFn(at.href, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, limit]) : limit, headers: { 'user-agent': 'DeepSeek-Harness-Bench' } });
    const status = Number(response?.status ?? 0);
    if (status >= 300 && status < 400) {
      const next = response.headers?.get?.('location');
      if (!next) throw new Error('the address sent Devices elsewhere without saying where');
      at = new URL(next, at);
      continue;
    }
    if (status < 200 || status >= 300) throw new Error(`the address answered ${status}`);
    break;
  }
  const length = Number(response.headers?.get?.('content-length') ?? 0);
  if (length > max) throw new Error(`the file is ${length} bytes, more than Devices downloads (${max})`);
  const temp = join(folder, `.download-${Date.now().toString(36)}.part`);
  const fd = openSync(temp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    const take = (chunk) => {
      const part = Buffer.from(chunk);
      bytes += part.length;
      if (bytes > max) throw new Error(`the file is larger than Devices downloads (${max} bytes)`);
      hash.update(part);
      writeSync(fd, part);
    };
    const reader = response.body?.getReader?.();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        take(value);
      }
    } else take(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(fd);
  if (bytes === 0) {
    rmSync(temp, { force: true });
    throw new Error('the file was empty');
  }
  return { temp, sum: hash.digest('hex'), bytes, from: at.href };
}

/**
 * Keep a checked download under its name: never over a file already there.
 * @returns {string} the kept file's path.
 */
export function keep(temp, folder, name) {
  const file = join(folder, name);
  try {
    linkSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    if (error?.code === 'EEXIST') throw new Error(`${name} is already in the firmware folder; Devices does not replace it. Remove it yourself or pick another name.`);
    throw error;
  }
  rmSync(temp, { force: true });
  return file;
}
