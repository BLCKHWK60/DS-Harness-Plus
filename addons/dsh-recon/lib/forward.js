/**
 * The direct route to one fixed server: a Usenet account's news server, or the Internet Archive
 * when it is read directly. The locked process may reach one local port and nothing else, so the
 * app opens that port for the length of one request and passes what arrives straight on to that
 * server and no other. It passes ciphertext: the encryption runs from the locked process to the
 * server, and this forwarder never sees a word of an article, a page or a login.
 */
import net from 'node:net';
import { socksConnect } from './vpn.js';

/**
 * @param {string} host - the news server.
 * @param {number} port - its port.
 * @param {{socksPort?: number}} [via] - the WireGuard tunnel's local SOCKS5 port, when one runs.
 * @returns {Promise<{port: number, close: () => void}>} the local port, and how to shut it.
 */
export function openForward(host, port, { socksPort = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const open = new Set();
    const server = net.createServer((near) => {
      open.add(near);
      near.pause();
      // Through the WireGuard tunnel when one runs (its SOCKS5 port, the name looked up on the far
      // side), straight otherwise (only after the user allowed it for the conversation).
      const reach = socksPort ? socksConnect(socksPort, host, port) : Promise.resolve(net.connect({ host, port }));
      reach.then((far) => {
        open.add(far);
        const end = () => {
          near.destroy();
          far.destroy();
          open.delete(near);
          open.delete(far);
        };
        near.on('error', end).on('close', end);
        far.on('error', end).on('close', end);
        near.pipe(far);
        far.pipe(near);
        near.resume();
      }, () => {
        near.destroy();
        open.delete(near);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        close: () => {
          for (const socket of open) socket.destroy();
          server.close();
        },
      }),
    );
  });
}
