// Fake YouTube Data API v3 + Analytics v2 for testing the Growth section without a key.
//   node scripts/fake-youtube.mjs [port=1238]   then in the app: localStorage.ytBase = 'http://localhost:1238'
import { createServer } from 'node:http';

const port = +(process.argv[2] ?? 1238);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS' };
const json = (res, code, body) => (res.writeHead(code, { 'Content-Type': 'application/json', ...cors }), res.end(JSON.stringify(body)));
const day = 86400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * day).toISOString();
const thumb = (seed) => ({ medium: { url: `https://picsum.photos/seed/${seed}/320/180` } });

// 8 channels from tiny to huge; 40 videos.
const channels = Array.from({ length: 8 }, (_, i) => ({
  id: `UC${String(i).padStart(22, 'x')}`, title: ['Tiny Stoic', 'Mind Atlas', 'Quiet Power', 'History Nerd', 'Deep Facts', 'Big Ideas', 'Mega Minds', 'Giant Network'][i],
  handle: `@chan${i}`, subs: [1200, 8000, 45000, 90000, 300000, 900000, 2500000, 9000000][i],
}));
const videos = Array.from({ length: 40 }, (_, i) => {
  const ch = channels[i % 8];
  const age = 5 + ((i * 37) % 700);
  return { id: `vid${String(i).padStart(8, '0')}`, ch, age, views: Math.round(ch.subs * (0.05 + ((i * 13) % 50) / 10) + (i % 3 === 0 ? 400000 : 0)), duration: i % 5 === 0 ? 'PT45S' : `PT${8 + (i % 20)}M${i % 60}S`, title: `Video ${i}: the stoic habit nobody talks about #${i}` };
});
const mine = { id: 'UCmineeeeeeeeeeeeeeeeeee', title: 'My Faceless Channel', handle: '@me', subs: 640 };
const myVideos = Array.from({ length: 6 }, (_, i) => ({ id: `my${String(i).padStart(9, '0')}`, ch: mine, age: 3 + i * 12, views: 300 + i * 900, duration: `PT${6 + i}M`, title: i === 0 ? 'video' : `Stoic lesson ${i}: control what you can`, tags: i === 0 ? [] : ['stoicism', 'stoic mindset'], description: i === 0 ? '' : 'A short lesson. #stoic' }));
const edits = new Map();

const videoRes = (v) => {
  const e = edits.get(v.id) ?? {};
  return {
    id: v.id,
    snippet: { title: e.title ?? v.title, description: e.description ?? v.description ?? `About ${v.title}`, tags: e.tags ?? v.tags ?? ['stoicism'], categoryId: '27', channelId: v.ch.id, channelTitle: v.ch.title, publishedAt: iso(v.age), thumbnails: thumb(v.id) },
    statistics: { viewCount: String(v.views), likeCount: String(Math.round(v.views / 30)), commentCount: '12' },
    contentDetails: { duration: v.duration },
  };
};
const channelRes = (c) => ({
  id: c.id, snippet: { title: c.title, customUrl: c.handle, thumbnails: thumb(c.id), publishedAt: iso(900) },
  statistics: { subscriberCount: String(c.subs), viewCount: String(c.subs * 120 + Math.floor(Date.now() / 60000) % 1000), videoCount: '120' },
  contentDetails: { relatedPlaylists: { uploads: `UU${c.id.slice(2)}` } },
});
const allVideos = [...videos, ...myVideos];

createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  const p = url.searchParams;
  const authed = /^Bearer /.test(req.headers.authorization ?? '');
  const path = url.pathname.replace(/^\/youtube\/v3/, '').replace(/^\/youtubeanalytics\/v2/, '');
  console.log(req.method, url.pathname, [...p.keys()].filter((k) => k !== 'key').join(','), authed ? '(oauth)' : '');
  if (!authed && p.get('key') !== 'FAKE' && !url.pathname.includes('analytics')) return json(res, 400, { error: { message: 'API key not valid. Please pass a valid API key.', errors: [{ reason: 'keyInvalid' }] } });
  if (path === '/search') {
    const order = p.get('order');
    const after = p.get('publishedAfter') ? Date.parse(p.get('publishedAfter')) : 0;
    let list = videos.filter((v) => Date.now() - v.age * day >= after);
    if (order === 'viewCount') list = [...list].sort((a, b) => b.views - a.views);
    return json(res, 200, { items: list.slice(0, +(p.get('maxResults') ?? 25)).map((v) => ({ id: { kind: 'youtube#video', videoId: v.id } })) });
  }
  if (path === '/videos' && req.method === 'PUT') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      edits.set(body.id, { title: body.snippet.title, description: body.snippet.description, tags: body.snippet.tags });
      const v = allVideos.find((x) => x.id === body.id);
      json(res, 200, videoRes(v));
    });
    return;
  }
  if (path === '/videos') {
    if (p.get('chart') === 'mostPopular') return json(res, 200, { items: [videoRes(videos[0])] });
    const ids = (p.get('id') ?? '').split(',');
    return json(res, 200, { items: allVideos.filter((v) => ids.includes(v.id)).map(videoRes) });
  }
  if (path === '/channels') {
    if (p.get('mine')) return authed ? json(res, 200, { items: [channelRes(mine)] }) : json(res, 401, { error: { message: 'Login required' } });
    if (p.get('forHandle')) return json(res, 200, { items: channels.filter((c) => c.handle.toLowerCase() === p.get('forHandle').toLowerCase()).map(channelRes) });
    const ids = (p.get('id') ?? '').split(',');
    return json(res, 200, { items: [...channels, mine].filter((c) => ids.includes(c.id)).map(channelRes) });
  }
  if (path === '/playlistItems') {
    const chId = `UC${(p.get('playlistId') ?? '').slice(2)}`;
    const list = (chId === mine.id ? myVideos : videos.filter((v) => v.ch.id === chId)).sort((a, b) => a.age - b.age);
    return json(res, 200, { items: list.map((v) => ({ contentDetails: { videoId: v.id } })) });
  }
  if (path === '/reports') {
    if (!authed) return json(res, 401, { error: { message: 'Login required' } });
    const dims = p.get('dimensions');
    if (!dims) return json(res, 200, { columnHeaders: [], rows: [[48000, 96000, 700, 60]] });
    if (dims === 'day') return json(res, 200, { rows: Array.from({ length: 28 }, (_, i) => [iso(28 - i).slice(0, 10), 100 + i * 12, 300 + i * 20, 95, 2 + (i % 4)]) });
    if (dims === 'creatorContentType') return json(res, 200, { rows: [['VIDEO_ON_DEMAND', 20000], ['SHORTS', 120000]] });
    if (dims === 'insightTrafficSourceType') return json(res, 200, { rows: [['YT_SEARCH', 2400], ['SUBSCRIBER', 900], ['RELATED_VIDEO', 700]] });
    if (dims === 'video') return json(res, 200, { rows: myVideos.slice(0, 4).map((v, i) => [v.id, v.views, 42 - i * 5]) });
  }
  json(res, 404, { error: { message: `not found ${path}` } });
}).listen(port, () => console.log(`fake YouTube API on http://localhost:${port}`));
