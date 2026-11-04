// Google sign-in for the desktop app (OAuth 2.0 for installed apps: loopback redirect + PKCE).
// The user's own OAuth client ("Desktop app" type) is used; tokens are encrypted with the OS keychain (safeStorage)
// and never leave the main process except as short-lived access tokens handed to the renderer.
const { app, BrowserWindow, ipcMain, net, safeStorage, session, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const FILE = () => path.join(app.getPath('userData'), 'google-auth.bin');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let stored = null; // { clientId, clientSecret, refreshToken, scopes }
let access = null; // { token, expiry }

function load() {
  if (stored) return stored;
  try {
    const raw = fs.readFileSync(FILE());
    stored = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'));
  } catch {
    stored = null;
  }
  return stored;
}

function save(data) {
  stored = data;
  const json = JSON.stringify(data);
  // Without OS encryption, keep the session in memory only rather than writing tokens in plain text.
  if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(FILE(), safeStorage.encryptString(json));
}

async function tokenRequest(params) {
  const r = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token error ${r.status}`);
  return j;
}

const page = (title, text) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#0a0b0f;color:#e8eaf0;display:grid;place-items:center;height:90vh"><div style="text-align:center"><h2>${title}</h2><p>${text}</p></div>`;

function signIn(win, { clientId, clientSecret, scopes }) {
  return new Promise((resolve) => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let redirect = '';
    const finish = (result) => {
      clearTimeout(timer);
      server.close();
      if (win && !win.isDestroyed()) win.focus();
      resolve(result);
    };
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, redirect);
      if (url.pathname !== '/') return res.writeHead(404).end();
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err || !code || url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(page('Sign-in cancelled', 'You can close this tab and go back to AutoStudio.'));
        return finish({ ok: false, error: err || 'Sign-in was cancelled.' });
      }
      try {
        const t = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier });
        if (!t.refresh_token) throw new Error('Google did not return a refresh token — remove AutoStudio from your Google account permissions and sign in again.');
        save({ clientId, clientSecret, refreshToken: t.refresh_token, scopes: String(t.scope || scopes.join(' ')).split(' ') });
        access = { token: t.access_token, expiry: Date.now() + (t.expires_in - 60) * 1000 };
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Signed in ✓', 'You can close this tab and go back to AutoStudio.'));
        finish({ ok: true });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('Sign-in failed', String(e.message)));
        finish({ ok: false, error: String(e.message) });
      }
    });
    const timer = setTimeout(() => finish({ ok: false, error: 'Sign-in timed out (5 minutes).' }), 5 * 60_000);
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${server.address().port}`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [k, v] of Object.entries({
        client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), code_challenge: challenge,
        code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      })) auth.searchParams.set(k, v);
      void shell.openExternal(auth.toString());
    });
  });
}

async function token() {
  if (access && access.expiry > Date.now()) return access.token;
  const s = load();
  if (!s?.refreshToken) return null;
  try {
    const t = await tokenRequest({ client_id: s.clientId, client_secret: s.clientSecret, refresh_token: s.refreshToken, grant_type: 'refresh_token' });
    access = { token: t.access_token, expiry: Date.now() + (t.expires_in - 60) * 1000 };
    return access.token;
  } catch {
    // Revoked or expired (Google expires refresh tokens of "Testing" apps after 7 days) — sign in again.
    await signOut(false);
    return null;
  }
}

async function signOut(revoke = true) {
  const s = load();
  if (revoke && s?.refreshToken) await net.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refreshToken)}`, { method: 'POST' }).catch(() => {});
  stored = null;
  access = null;
  fs.rmSync(FILE(), { force: true });
}

/** YouTube search suggestions (no CORS from the main process). */
async function suggest(q, lang) {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=${encodeURIComponent(lang || 'en')}&q=${encodeURIComponent(String(q).slice(0, 200))}`;
  const r = await net.fetch(u);
  const j = JSON.parse(await r.text());
  return Array.isArray(j?.[1]) ? j[1].map(String) : [];
}

/** Media downloads for the free-media search (renderer fetches can be blocked by CORS). */
async function fetchMedia(url) {
  const u = new URL(String(url));
  if (u.protocol !== 'https:') throw new Error('Only https downloads are allowed');
  const r = await net.fetch(u.toString());
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const type = r.headers.get('content-type') ?? '';
  if (!/^(image|video|audio)\//.test(type) && !/ogg|octet-stream/.test(type)) throw new Error(`Not a media file (${type})`);
  const len = +(r.headers.get('content-length') ?? 0);
  if (len > 250e6) throw new Error('File too large (> 250 MB)');
  const data = await r.arrayBuffer();
  if (data.byteLength > 250e6) throw new Error('File too large (> 250 MB)');
  return { type, data };
}

function registerGoogle() {
  ipcMain.handle('autostudio:fetch-media', (_e, url) => fetchMedia(url));
  ipcMain.handle('autostudio:flush-dns', () => session.defaultSession.clearHostResolverCache());
  ipcMain.handle('autostudio:google-signin', (e, opts) => {
    if (!opts?.clientId || !opts?.clientSecret || !Array.isArray(opts.scopes)) return { ok: false, error: 'Missing client ID / secret.' };
    return signIn(BrowserWindow.fromWebContents(e.sender), opts);
  });
  ipcMain.handle('autostudio:google-token', () => token());
  ipcMain.handle('autostudio:google-status', () => ({ signedIn: !!load()?.refreshToken, scopes: load()?.scopes ?? [] }));
  ipcMain.handle('autostudio:google-signout', () => signOut(true));
  ipcMain.handle('autostudio:suggest', (_e, q, lang) => suggest(q, lang).catch(() => []));
}

module.exports = { registerGoogle };
