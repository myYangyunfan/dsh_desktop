'use strict';
// HTTPS mock server：基于 fixtures/test-cert.pem 的自签名证书，供 fetchJson 的
// https 重定向安全测试使用（同主机保留 Authorization / 降级 http 剥离）。
// 测试进程内需先设置 NODE_TLS_REJECT_UNAUTHORIZED=0（测试代码负责恢复）。
// 证书仅用于本地回环测试，绝不出现在生产路径。

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');

function createTlsServer() {
  const routes = new Map(); // path -> handler(req, res)
  let server = null;

  const api = {
    port: 0,
    requestLog: [],

    setRoute(pathname, opts) {
      routes.set(pathname, (req, res) => {
        const status = opts.status || 200;
        const body = opts.json !== undefined ? JSON.stringify(opts.json) : (opts.body || '');
        res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}));
        res.end(body);
      });
    },

    setRedirect(pathname, location, status) {
      routes.set(pathname, (req, res) => {
        res.writeHead(status || 302, { Location: location });
        res.end();
      });
    },

    start() {
      return new Promise((resolve) => {
        server = https.createServer({
          key: fs.readFileSync(path.join(FIXTURES, 'test-key.pem')),
          cert: fs.readFileSync(path.join(FIXTURES, 'test-cert.pem')),
        }, (req, res) => {
          api.requestLog.push({ url: req.url, method: req.method, headers: req.headers });
          const handler = routes.get(req.url.split('?')[0]);
          if (handler) handler(req, res);
          else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end('{}');
          }
        });
        server.listen(0, '127.0.0.1', () => {
          api.port = server.address().port;
          resolve();
        });
      });
    },

    stop() {
      return new Promise((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
    },

    url(pathname) {
      return 'https://localhost:' + api.port + pathname;
    },
  };

  return api;
}

module.exports = { createTlsServer };
