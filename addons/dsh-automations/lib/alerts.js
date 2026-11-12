/**
 * Alerts: a short line on this Mac and, when set up, on your phone.
 *
 * The line is built here from fixed words plus a name: the task's name for a scheduled task, or the
 * project folder's name for a conversation you started. It never contains your instruction or the
 * assistant's answer. Kept apart from the plugin so it can be tested without the app.
 */
import { execFile } from 'node:child_process';

/** The three things an alert can be about. */
export const EVENTS = ['failed', 'needs', 'finished'];
/** At most this many alerts in a minute, whatever happens. */
export const PER_MINUTE = 10;
/** A phone service that does not answer is given up on after this long. */
export const SEND_TIMEOUT_MS = 8000;
/** ntfy topic names: letters, digits, `-` and `_`, up to 64 characters. */
const TOPIC = /^[-_A-Za-z0-9]{1,64}$/;

const WAIT_WORDS = { approval: 'needs your approval', question: 'has a question for you', 'plan-review': 'wants its plan reviewed' };

/**
 * A name as plain text of a sensible length.
 * @param {unknown} value - a task or folder name.
 * @returns {string} the cleaned name.
 */
export function cleanName(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * The alert's line.
 * @param {object} what - what happened.
 * @param {'failed' | 'needs' | 'finished'} what.event - the kind.
 * @param {string} [what.name] - the task's name, or the project folder's.
 * @param {boolean} [what.scheduled] - whether it is a scheduled task.
 * @param {string} [what.waiting] - for `needs`: approval, question or plan-review.
 * @param {string} [what.state] - for `failed`: failed or stopped.
 * @returns {string} the line.
 */
export function alertText({ event, name, scheduled, waiting, state }) {
  const clean = cleanName(name);
  const who = scheduled ? clean || 'A scheduled task' : clean ? `A task in ${clean}` : 'A task';
  if (event === 'needs') return `${who} ${WAIT_WORDS[waiting] ?? 'needs you'}`;
  if (event === 'failed') return `${who} ${state === 'stopped' ? 'was stopped before it finished' : 'failed'}`;
  return `${who} finished`;
}

/**
 * Settings as plain checked values.
 * @param {object} raw - the settings.
 * @returns {object} checked settings.
 */
export function readAlertSettings(raw = {}) {
  const minutes = Math.floor(Number(raw.othersMinutes));
  const server = String(raw.ntfyServer ?? '').trim().replace(/\/+$/, '');
  return {
    failed: raw.alertFailed !== false,
    needs: raw.alertNeeds !== false,
    finished: raw.alertFinished === true,
    others: raw.alertOthers === true,
    othersMinutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : 2,
    mac: raw.mac !== false,
    phone: raw.phone === true,
    ntfyServer: server || 'https://ntfy.sh',
    ntfyTopic: String(raw.ntfyTopic ?? '').trim(),
  };
}

/**
 * Why the phone settings cannot work, if they cannot.
 * @param {{ntfyServer: string, ntfyTopic: string}} settings - checked settings.
 * @returns {string} '' when they can, otherwise the reason.
 */
export function phoneProblem(settings) {
  if (!settings.ntfyTopic) return 'No topic is set.';
  if (!TOPIC.test(settings.ntfyTopic)) return 'The topic may only have letters, digits, - and _, up to 64 characters.';
  let url;
  try {
    url = new URL(settings.ntfyServer);
  } catch {
    return 'The server address is not a web address.';
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return 'The server address must start with https://.';
  return '';
}

/** The senders; replaceable by tests. */
export const hooks = {
  /**
   * Show a notification on this Mac. The words reach the script through the environment, so a name
   * with quotes in it cannot change the script.
   * @param {string} title - the heading.
   * @param {string} text - the line.
   * @returns {Promise<void>} resolves when shown.
   */
  mac(title, text) {
    return new Promise((resolve, reject) => {
      execFile(
        'osascript',
        ['-e', 'display notification (system attribute "DSH_ALERT_TEXT") with title (system attribute "DSH_ALERT_TITLE")'],
        { env: { ...process.env, DSH_ALERT_TEXT: text, DSH_ALERT_TITLE: title }, timeout: 5000 },
        (error) => (error ? reject(new Error(String(error.code ?? error.message))) : resolve()),
      );
    });
  },

  /**
   * Publish to an ntfy topic (the JSON form: POST to the server's root).
   * @param {{ntfyServer: string, ntfyTopic: string}} settings - checked settings.
   * @param {{title: string, text: string, event: string}} alert - the alert.
   * @returns {Promise<void>} resolves when the service accepted it.
   */
  async phone(settings, alert) {
    const body = {
      topic: settings.ntfyTopic,
      title: alert.title,
      message: alert.text,
      priority: alert.event === 'failed' ? 4 : 3,
      tags: [alert.event === 'failed' ? 'warning' : alert.event === 'needs' ? 'raising_hand' : 'white_check_mark'],
    };
    const response = await fetch(`${settings.ntfyServer}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`the service answered ${response.status}`);
  },
};

/**
 * The alerter.
 * @param {object} options - what it needs.
 * @param {() => object} options.settings - current checked settings (`readAlertSettings`).
 * @param {(text: string) => void} [options.warn] - where problems are logged.
 * @param {() => number} [options.now] - the clock.
 * @returns {object} the alerter.
 */
export function createAlerter({ settings, warn = () => {}, now = () => Date.now() }) {
  let recent = [];
  const status = { sent: 0, skipped: 0, macError: '', phoneError: '' };

  /**
   * Send one alert through the channels that are switched on. Never throws.
   * @param {{title: string, text: string, event: string}} alert - the alert.
   * @returns {Promise<{mac?: string, phone?: string}>} per channel: 'ok', or what went wrong.
   */
  const deliver = async (alert) => {
    const set = settings();
    const result = {};
    const jobs = [];
    if (set.mac) {
      jobs.push(hooks.mac(alert.title, alert.text).then(
        () => { result.mac = 'ok'; status.macError = ''; },
        (error) => { result.mac = String(error?.message ?? error).slice(0, 120); status.macError = result.mac; warn(`Mac notification failed: ${result.mac}`); },
      ));
    }
    if (set.phone) {
      const problem = phoneProblem(set);
      if (problem) {
        result.phone = problem;
        status.phoneError = problem;
      } else {
        jobs.push(hooks.phone(set, alert).then(
          () => { result.phone = 'ok'; status.phoneError = ''; },
          (error) => {
            result.phone = error?.name === 'TimeoutError' ? 'the service did not answer' : String(error?.message ?? error).slice(0, 120);
            status.phoneError = result.phone;
            warn(`phone alert failed: ${result.phone}`);
          },
        ));
      }
    }
    await Promise.all(jobs);
    return result;
  };

  return {
    /**
     * Something happened; alert if the settings ask for it.
     * @param {object} what - see `alertText`, plus `minutes` (how long the task has run).
     * @returns {Promise<object> | undefined} the delivery, or undefined when no alert was due.
     */
    notify(what) {
      const set = settings();
      if (!EVENTS.includes(what.event) || !set[what.event]) return undefined;
      if (!what.scheduled && (!set.others || (Number(what.minutes) || 0) < set.othersMinutes)) return undefined;
      if (!set.mac && !set.phone) return undefined;
      const at = now();
      recent = recent.filter((time) => at - time < 60000);
      if (recent.length >= PER_MINUTE) {
        status.skipped += 1;
        return undefined;
      }
      recent.push(at);
      status.sent += 1;
      return deliver({ title: 'DeepSeek Harness', text: alertText(what), event: what.event });
    },

    /** A sample alert through the channels that are on, whatever the other switches say. */
    test: () => deliver({ title: 'DeepSeek Harness', text: 'This is a test alert. Alerts are working.', event: 'finished' }),

    status: () => ({ ...status }),
  };
}
