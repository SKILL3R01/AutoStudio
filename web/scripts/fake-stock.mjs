// Fake free-image sources (Openverse, Wikimedia Commons, NASA, The Met, Art Institute) for testing stock search offline.
//   node scripts/fake-stock.mjs [port=1239]   then in the app: localStorage.stockBase = 'http://localhost:1239'
import { createServer } from 'node:http';

const port = +(process.argv[2] ?? 1239);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const base = `http://localhost:${port}`;
// 1×1 PNG (any colour works: the app only needs a real image to download and rank).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const img = (name) => `${base}/img/${name}.png`;

createServer((req, res) => {
  const u = new URL(req.url, base), q = u.searchParams.get('q') || u.searchParams.get('gsrsearch') || 'image';
  const json = (b) => (res.writeHead(200, { 'Content-Type': 'application/json', ...cors }), res.end(JSON.stringify(b)));
  if (u.pathname.startsWith('/img/')) return res.writeHead(200, { 'Content-Type': 'image/png', ...cors }), res.end(PNG);
  if (u.pathname === '/v1/images/') return json({ results: [0, 1, 2].map((i) => ({ id: `ov${i}`, title: `${q} photo ${i}`, url: img(`ov${i}`), thumbnail: img(`ovt${i}`), license: i === 2 ? 'by' : 'cc0', foreign_landing_url: `${base}/page/ov${i}`, creator: 'Someone' })) });
  if (u.pathname === '/w/api.php') return json({ query: { pages: { 1: { pageid: 1, title: 'File:Test.jpg', imageinfo: [{ thumburl: `${base}/img/480px-wm1.png`, url: img('wm1'), descriptionurl: `${base}/page/wm1`, extmetadata: { License: { value: 'pd' }, ObjectName: { value: `${q.split(' ')[0]} engraving` } } }] }, 2: { pageid: 2, title: 'File:Bysa.jpg', imageinfo: [{ thumburl: img('wm2'), extmetadata: { License: { value: 'cc-by-sa-4.0' } } }] } } } });
  if (u.pathname === '/search') return json({ collection: { items: [{ data: [{ nasa_id: 'n1', title: `${q} from orbit`, center: 'JSC' }], links: [{ href: `${base}/img/n1~medium.png`, render: 'image' }] }] } });
  if (u.pathname === '/public/collection/v1.1/search') return json({ total: 2, objectIDs: [11, 12] });
  if (u.pathname.startsWith('/public/collection/v1/objects/')) {
    const id = +u.pathname.split('/').pop();
    return json({ objectID: id, isPublicDomain: id === 11, primaryImageSmall: img(`met${id}`), primaryImage: img(`met${id}`), title: `Painting ${id}`, objectURL: `${base}/page/met${id}` });
  }
  if (u.pathname === '/api/v1/artworks/search') return json({ data: [{ id: 5, title: `${q} study`, image_id: 'abc', artist_title: 'Painter' }], config: { iiif_url: `${base}/iiif` } });
  if (u.pathname.startsWith('/iiif/')) return res.writeHead(200, { 'Content-Type': 'image/png', ...cors }), res.end(PNG);
  res.writeHead(404, cors);
  res.end();
}).listen(port, () => console.log(`fake stock sources on ${base}`));
