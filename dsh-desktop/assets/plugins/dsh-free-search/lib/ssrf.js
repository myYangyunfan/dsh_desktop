/**
 * SSRF guard for web_fetch. The agent can ask the plugin to fetch any HTTPS URL;
 * without this a page could point at loopback, private networks or cloud metadata
 * endpoints and have their content returned as "web" text.
 */
import dns from "node:dns";
import net from "node:net";

function ipv4Parts(address) {
  const parts = address.split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPublicIPv4(address) {
  const parts = ipv4Parts(address);
  if (parts === null) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIPv6(address) {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return false;
  if (value.startsWith("::ffff:")) return isPublicIPv4(value.slice(7));
  if (value.startsWith("fc") || value.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(value)) return false;
  if (value.startsWith("ff")) return false;
  if (value.startsWith("2001:db8")) return false;
  return true;
}

/** True only for globally routable addresses; unknown input is treated as unsafe. */
export function isPublicAddress(address) {
  const family = net.isIP(String(address));
  if (family === 4) return isPublicIPv4(String(address));
  if (family === 6) return isPublicIPv6(String(address));
  return false;
}

function bareHost(hostname) {
  return String(hostname).replace(/^\[/, "").replace(/\]$/, "");
}

/** dns.lookup replacement that refuses to connect to private addresses (redirects included). */
export function safeLookup(hostname, options, callback) {
  const host = bareHost(hostname);
  dns.lookup(host, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [];
    const blocked = list.find((entry) => !isPublicAddress(entry.address));
    if (blocked) {
      callback(new Error(`SSRF blocked: ${host} resolves to private address ${blocked.address}`));
      return;
    }
    if (options?.all) {
      callback(null, list);
      return;
    }
    callback(null, list[0]?.address, list[0]?.family);
  });
}

/**
 * Reject non-HTTPS URLs and hosts that resolve (or literally point) to a private
 * address. A custom lookup is allowed for tests.
 */
export async function assertPublicUrl(rawUrl, { lookup = dns.promises.lookup } = {}) {
  let target;
  try {
    target = new URL(String(rawUrl ?? ""));
  } catch {
    throw new Error("invalid URL");
  }
  if (target.protocol !== "https:") throw new Error(`only https URLs are supported (got "${target.protocol}")`);
  if (target.username || target.password) throw new Error("URLs with embedded credentials are not allowed");
  const host = bareHost(target.hostname);
  if (host === "") throw new Error("URL has no host");
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new Error(`SSRF blocked: ${host} is a private address`);
    return target;
  }
  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`cannot resolve host "${host}"`);
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  const blocked = list.find((entry) => !isPublicAddress(entry?.address ?? entry));
  if (blocked) {
    throw new Error(`SSRF blocked: ${host} resolves to private address ${blocked.address ?? blocked}`);
  }
  if (list.length === 0) throw new Error(`cannot resolve host "${host}"`);
  return target;
}
