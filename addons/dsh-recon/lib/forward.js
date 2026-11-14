/**
 * The direct route to the news server. The locked process may reach one local port and nothing
 * else, so the app opens that port for the length of one request and passes what arrives straight
 * on to the server. It passes ciphertext: the encryption runs from the locked process to the
 * server, and this forwarder never sees a word of an article or the login.
 */
import net from 'node:net';

/**
 * @param {string} host - the news server.
 * @param {number} port - its port.
 * @returns {Promise<{port: number, close: () => void}>} the local port, and how to shut it.
 */
export function openForward(host, port) {
  return new Promise((resolve, reject) => {
    const open = new Set();
    const server = net.createServer((near) => {
      const far = net.connect({ host, port });
      open.add(near).add(far);
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
