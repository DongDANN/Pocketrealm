/**
 * Serves dist/ with the headers, rewrite and content types from vercel.json. This is the local
 * stand-in used by Lighthouse and the CSP check: if the config drifts, this server fails loudly
 * instead of silently serving a different policy from the one Vercel will apply.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';

const ROOT = resolve('dist');
const CONFIG = JSON.parse(readFileSync('vercel.json', 'utf8'));
const PORT = Number(process.env.PORT ?? 4174);

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function sourceMatcher(source) {
  switch (source) {
    case '/(.*)':
      return /^\/.*$/;
    case '/assets/(.*)':
      return /^\/assets\/.*$/;
    case '/workbox-.*\\.js':
      return /^\/workbox-[^/]*\.js$/;
    case '/((?!assets/|ui/|icons/)[^.]*)':
      return /^\/((?!assets\/|ui\/|icons\/)[^.]*)$/;
    default:
      if (source.includes('*') || source.includes('(')) {
        throw new Error(`serve-vercel: source pattern needs a matcher: ${source}`);
      }
      return new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  }
}

const headerRules = (CONFIG.headers ?? []).map((rule) => ({
  match: sourceMatcher(rule.source),
  headers: rule.headers,
}));
const rewrites = (CONFIG.rewrites ?? []).map((rule) => ({
  match: sourceMatcher(rule.source),
  destination: rule.destination,
}));

function headersFor(pathname) {
  const headers = {};
  for (const rule of headerRules) {
    if (!rule.match.test(pathname)) continue;
    for (const header of rule.headers) headers[header.key] = header.value;
  }
  return headers;
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^([/\\])+/, '');
  const target = join(ROOT, normalized === '' ? 'index.html' : normalized);
  if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) return null;
  return target;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const pathname = url.pathname;
  const headers = headersFor(pathname);
  headers['X-Content-Type-Options'] = headers['X-Content-Type-Options'] ?? 'nosniff';

  let file = safePath(pathname);
  if (!file) {
    response.writeHead(400, headers);
    response.end('Bad path');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    const rewrite = rewrites.find((rule) => rule.match.test(pathname));
    if (!rewrite) {
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    file = safePath(rewrite.destination);
    if (!file || !existsSync(file)) {
      response.writeHead(500, headers);
      response.end('Rewrite target missing');
      return;
    }
  }

  const type = TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream';
  const compressible =
    type.startsWith('text/') ||
    type.startsWith('application/javascript') ||
    type.startsWith('application/json') ||
    type.startsWith('application/manifest+json');
  const gzip = compressible && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
  const responseHeaders = {
    ...headers,
    'Content-Type': type,
    ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
  };
  if (!gzip) responseHeaders['Content-Length'] = statSync(file).size;
  response.writeHead(200, responseHeaders);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file);
  if (gzip) stream.pipe(createGzip()).pipe(response);
  else stream.pipe(response);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Serving dist with vercel.json on http://127.0.0.1:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
