import { useEffect, useState } from 'react';
import { DAILY_QUOTA, GOOGLE_SCOPES, googleAvailable, testKey, useYt } from '../lib/youtube';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { Meter } from './shared';

export function useGoogleStatus() {
  const [s, setS] = useState<{ signedIn: boolean; scopes: string[] } | null>(null);
  const refresh = () => void window.autostudio?.google?.status().then(setS);
  useEffect(refresh, []);
  return { status: s, refresh };
}

export function SetupTab() {
  const { key, setKey, used } = useYt();
  const [value, setValue] = useState(key);
  const [msg, setMsg] = useState('');
  const [clientId, setClientId] = useState(() => localStorage.getItem('googleClientId') ?? '');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const { status, refresh } = useGoogleStatus();

  const test = async () => {
    setKey(value);
    setMsg('Testing…');
    try {
      const t = await testKey();
      setMsg(`Key works ✓ (today's #1 trending: “${t.slice(0, 60)}”)`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const signIn = async () => {
    setBusy(true);
    localStorage.setItem('googleClientId', clientId.trim());
    const r = await window.autostudio!.google!.signIn({ clientId: clientId.trim(), clientSecret: secret.trim(), scopes: GOOGLE_SCOPES });
    setBusy(false);
    setSecret('');
    refresh();
    toast(r.ok ? 'Signed in with Google' : r.error ?? 'Sign-in failed', r.ok ? 'ok' : 'error');
  };

  return (
    <div className="growth-grid">
      <div className="card">
        <h3>1 · YouTube API key <em className="tag">free · 5 min</em></h3>
        <p className="hint">Needed for keyword research, outliers, competitors and niches (public data). Stays on this computer.</p>
        <ol className="setup">
          <li><b>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a></b> and create a project (e.g. “AutoStudio”). No credit card needed.</li>
          <li><b>Enable the APIs:</b> <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">YouTube Data API v3</a> (and <a href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com" target="_blank" rel="noreferrer">YouTube Analytics API</a> for “My channel”).</li>
          <li><b><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → Create credentials → API key.</b> Optional: edit it → API restrictions → YouTube Data API v3.</li>
          <li>
            <b>Paste it here:</b>
            <div className="row">
              <input value={value} placeholder="AIza…" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && test()} />
              <button className="btn" onClick={test}>Save & test</button>
            </div>
            {msg && <span className="hint">{msg}</span>}
          </li>
        </ol>
        <Meter label="Quota used today" value={used} goal={DAILY_QUOTA} fmt={(n) => n.toLocaleString()} />
        <p className="hint">A keyword analysis costs ~102 units, an outlier search ~102, a competitor refresh ~3. Results are cached for 12 h. Resets at midnight Pacific time.</p>
      </div>

      <div className="card">
        <h3>2 · Sign in with Google <em className="tag">optional · 15 min once</em></h3>
        <p className="hint">Unlocks <b>My channel</b> (watch hours, Partner Program progress, top videos) and the <b>Optimizer</b> (edit titles, descriptions and tags from here).</p>
        {!googleAvailable() ? (
          <p className="warn">Sign-in works in the desktop app (the browser version can only use the API key).</p>
        ) : status?.signedIn ? (
          <div className="row wrap">
            <span className="chip ok"><Icon name="check" size={13} /> Signed in</span>
            <button className="btn sm ghost" onClick={() => void window.autostudio!.google!.signOut().then(refresh)}>Sign out</button>
          </div>
        ) : (
          <ol className="setup">
            <li><b><a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">OAuth consent screen</a></b> (same project): User type <b>External</b>, app name “AutoStudio”, your email. Leave it in <b>Testing</b> and add your own Gmail under <b>Test users</b>.</li>
            <li><b><a href="https://console.cloud.google.com/apis/credentials/oauthclient" target="_blank" rel="noreferrer">Create OAuth client ID</a> → Application type: Desktop app.</b> Copy the client ID and secret.</li>
            <li>
              <b>Paste them and sign in:</b>
              <input value={clientId} placeholder="Client ID (….apps.googleusercontent.com)" onChange={(e) => setClientId(e.target.value)} />
              <input value={secret} type="password" placeholder="Client secret (GOCSPX-…)" onChange={(e) => setSecret(e.target.value)} />
              <button className="btn primary" disabled={busy || !clientId.trim() || !secret.trim()} onClick={signIn}><Icon name="link" /> {busy ? 'Waiting for the browser…' : 'Sign in with Google'}</button>
              <span className="hint">Your browser opens Google's sign-in. Google will warn that the app is unverified — it is your own app: Advanced → Go to AutoStudio. Tokens are encrypted on this PC; in Testing mode Google asks you to sign in again about every 7 days.</span>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
