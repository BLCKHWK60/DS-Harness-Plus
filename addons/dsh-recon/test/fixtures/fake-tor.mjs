// A stand-in for the tor program, for tests: takes tor's arguments, opens the SOCKS port, says it
// is connected, and sends every *.onion request to one local web server (FAKE_ONION_HTTP).
// It never touches the network.
import net from 'node:net';
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const [, port] = String(value('--SocksPort')).split(':');
const target = Number(process.env.FAKE_ONION_HTTP);
if (process.env.FAKE_TOR_FAIL) { console.log('Nov 14 [warn] Could not bind: pretend failure'); process.exit(1); }
const server = net.createServer((socket) => {
  let stage = 0; let buf = Buffer.alloc(0);
  socket.on('error', () => {});
  socket.on('data', function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    if (stage === 0) { if (buf.length < 2 + buf[1]) return; const wantsAuth = buf.subarray(2, 2 + buf[1]).includes(2); buf = buf.subarray(2 + buf[1]); socket.write(Buffer.from([5, wantsAuth ? 2 : 0])); stage = wantsAuth ? 1 : 2; }
    if (stage === 1) { if (buf.length < 2) return; const u = buf[1]; if (buf.length < 3 + u) return; const p = buf[2 + u]; if (buf.length < 3 + u + p) return; console.log(`USER ${buf.subarray(2, 2 + u).toString()}`); buf = buf.subarray(3 + u + p); socket.write(Buffer.from([1, 0])); stage = 2; }
    if (stage === 2) {
      if (buf.length < 5) return;
      if (buf[3] !== 3) { console.log('REFUSED not-a-name'); socket.end(Buffer.from([5, 4, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      const n = buf[4]; if (buf.length < 7 + n) return;
      const host = buf.subarray(5, 5 + n).toString(); const rest = buf.subarray(7 + n);
      console.log(`CONNECT ${host}`);
      if (!host.endsWith('.onion') || host.startsWith('down')) { socket.end(Buffer.from([5, 4, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      stage = 3; socket.off('data', onData);
      const up = net.connect({ host: '127.0.0.1', port: target }, () => { socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); if (rest.length) up.write(rest); socket.pipe(up); up.pipe(socket); });
      up.on('error', () => socket.destroy());
    }
  });
});
server.listen(Number(port), '127.0.0.1', () => { console.log('Nov 14 [notice] Bootstrapped 10% (conn_done): Connected'); setTimeout(() => console.log('Nov 14 [notice] Bootstrapped 100% (done): Done'), 150); });
process.on('SIGTERM', () => process.exit(0));
