'use strict';

const path = require('node:path');
const APP_URL = 'sculpt://app/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self'; base-uri 'none'; form-action 'none'";
const METHODS = Object.freeze(['connect', 'disconnect', 'sendTCP', 'sendUDP']);
const EVENTS = Object.freeze(['packet', 'linkState']);

function isAppURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'sculpt:' && url.hostname === 'app' && !url.port &&
      !url.username && !url.password && !url.search && url.pathname === '/index.html';
  } catch { return false; }
}

function assetPath(value, appRoot) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'sculpt:' || url.hostname !== 'app' || url.port || url.username || url.password || url.search) return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (!pathname.startsWith('/') || /[\\\0]/.test(pathname) || pathname.split('/').some(part => part === '..' || part === '.')) return null;
  if (pathname === '/') pathname = '/index.html';
  const root = path.resolve(appRoot);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return null;
  return file;
}

function validateArguments(method, value) {
  if (!METHODS.includes(method) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Richiesta desktop non valida.');
  const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  if (method === 'connect') {
    if (typeof value.host !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value.host) || !identifier(value.requestId)) throw new Error('Indirizzo WING o richiesta non validi.');
    return { host: value.host, requestId: value.requestId };
  }
  if (method === 'disconnect') {
    if ((!value.sessionId && !value.requestId) || (value.sessionId !== undefined && !identifier(value.sessionId)) || (value.requestId !== undefined && !identifier(value.requestId))) throw new Error('Sessione desktop non valida.');
    return { ...(value.sessionId ? { sessionId: value.sessionId } : {}), ...(value.requestId ? { requestId: value.requestId } : {}) };
  }
  if (!identifier(value.sessionId) || typeof value.data !== 'string' || value.data.length > 1_398_104) throw new Error('Pacchetto desktop non valido.');
  return { sessionId: value.sessionId, data: value.data };
}

module.exports = { APP_URL, CSP, METHODS, EVENTS, isAppURL, assetPath, validateArguments };
