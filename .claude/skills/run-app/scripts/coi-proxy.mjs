// Puts COOP/COEP on Metro's web output so the OPFS database works (ADR 0012).
//   node coi-proxy.mjs <listen-port> <metro-port>
import http from 'node:http';

const [, , listenPort, metroPort] = process.argv;
http
  .createServer((req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: metroPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, {
          ...up.headers,
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
          'cross-origin-resource-policy': 'cross-origin',
        });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(Number(listenPort), '127.0.0.1');
