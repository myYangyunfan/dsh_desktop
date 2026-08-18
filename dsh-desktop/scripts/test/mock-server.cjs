'use strict';
// 可配置 HTTP mock server：balance.js 的 queryBalance / fetchJson 端到端测试用。
// 不触碰真实网络；所有请求/响应在进程内闭环。与 audit 期间的 mock-server 同构，
// 补充：header 断言、slow-drip（逐块慢速响应，用于总超时测试）、分块大响应。
//
// 用法：
//   const srv = createMockServer();
//   await srv.start();                      // srv.port 填充实际端口
//   srv.setRoute('/user/balance', { status: 200, json: {...} });
//   srv.setRedirect('/redir', 'http://127.0.0.1:<port>/target');
//   srv.setRaw('/badjson', { status: 200, body: 'not json{' });
//   srv.setChunked('/drip', { chunkMs: 20, totalMs: 2000, body: '...' });
//   srv.setLarge('/huge', 2_000_000);
//   ... 测试 ...
//   await srv.stop();

const http = require('node:http');

function createMockServer() {
  const routes = new Map(); // path -> handler(req, res)
  let server = null;

  const api = {
    port: 0,
    requestLog: [], // { url, method, headers, body? }

    setRoute(pathname, opts) {
      routes.set(pathname, (req, res) => {
        const status = opts.status || 200;
        const body = opts.json !== undefined ? JSON.stringify(opts.json) : (opts.body || '');
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        res.writeHead(status, headers);
        res.end(body);
      });
    },

    // 重定向到绝对或相对 Location
    setRedirect(pathname, location, status) {
      routes.set(pathname, (req, res) => {
        res.writeHead(status || 302, { Location: location });
        res.end();
      });
    },

    // 原始响应体（非 JSON、自定义 status）
    setRaw(pathname, opts) {
      routes.set(pathname, (req, res) => {
        const status = opts.status || 200;
        const body = opts.body || '';
        res.writeHead(status, opts.headers || { 'Content-Type': 'text/plain' });
        res.end(body);
      });
    },

    // 慢速分块（slow-drip）：每 chunkMs 写一块，整段 body 在 totalMs 内写完。
    // 用于「总超时」测试——空闲超时不会触发（每块间隔 < 超时），总 deadline 会。
    setChunked(pathname, opts) {
      routes.set(pathname, (req, res) => {
        res.writeHead(opts.status || 200, { 'Content-Type': 'application/json' });
        const body = opts.body || '';
        const chunkMs = opts.chunkMs || 20;
        const size = Math.max(1, Math.ceil(body.length / Math.max(1, Math.ceil((opts.totalMs || 1000) / chunkMs))));
        let offset = 0;
        (function writeNext() {
          if (offset >= body.length) { res.end(); return; }
          res.write(body.slice(offset, offset + size));
          offset += size;
          setTimeout(writeNext, chunkMs);
        })();
      });
    },

    // 超大响应（用于体积上限测试）
    setLarge(pathname, size) {
      routes.set(pathname, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const chunk = 'A'.repeat(64 * 1024);
        let remaining = size;
        function writeNext() {
          if (remaining <= 0) { res.end(); return; }
          const n = Math.min(chunk.length, remaining);
          res.write(chunk.slice(0, n));
          remaining -= n;
          setImmediate(writeNext);
        }
        writeNext();
      });
    },

    // 链式重定向：path1 -> path2 -> ... -> finalPath (返回 opts)
    setRedirectChain(chain, finalOpts) {
      for (let i = 0; i < chain.length - 1; i++) {
        this.setRedirect(chain[i], chain[i + 1], 302);
      }
      const finalPath = chain[chain.length - 1];
      this.setRoute(finalPath, finalOpts);
    },

    clear() {
      routes.clear();
      api.requestLog.length = 0;
    },

    start() {
      return new Promise((resolve) => {
        server = http.createServer((req, res) => {
          api.requestLog.push({ url: req.url, method: req.method, headers: req.headers });
          const pathname = req.url.split('?')[0];
          const handler = routes.get(pathname);
          if (handler) handler(req, res);
          else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'no route for ' + req.url }));
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
      return 'http://127.0.0.1:' + api.port + pathname;
    },
  };

  return api;
}

module.exports = { createMockServer };
