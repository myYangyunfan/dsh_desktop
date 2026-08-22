'use strict';

/**
 * HTTP JSON 拉取（重定向 / 超时 / 字节上限）
 * ==========================================
 * 从 cli.js 原样迁出（重定向链、超时、User-Agent 语义不变），补齐字节上限。
 *
 * 历史缺陷（性能审计 2026-08）：响应体无限累积成字符串——本通道服务
 * npm latest / GitHub Releases 元数据（先于 integrity 校验，无任何完整性
 * 保护），慢滴或巨型响应可吃满内存。对照 httpGetBuffer 的 64MB 与
 * balance.js 的 1MB maxBodyBytes，这是该文件族唯一的缺口。
 */

const https = require('node:https');

/** 元数据通道上限：真实负载 <100KB，4MB 已极宽裕。 */
const MAX_JSON_BYTES = 4 * 1024 * 1024;

function httpGetJson(url, timeoutMs = 15000, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'));
    let client;
    try {
      const u = new URL(url);
      client = u.protocol === 'https:' ? https : require('node:http');
    } catch (err) { return reject(err); }
    const req = client.get(url, { headers: { 'User-Agent': 'DSH-Desktop', ...headers }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGetJson(new URL(res.headers.location, url).toString(), timeoutMs, headers, redirects + 1));
      }
      const chunks = [];
      let total = 0;
      let limitHit = false;
      res.on('data', (c) => {
        if (limitHit) return;
        total += c.length;
        if (total > MAX_JSON_BYTES) {
          limitHit = true;
          req.destroy(new Error(`响应超过 ${MAX_JSON_BYTES} 字节上限`));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        if (limitHit) return;
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('响应不是合法 JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', (err) => reject(err));
  });
}

module.exports = { httpGetJson, MAX_JSON_BYTES };
