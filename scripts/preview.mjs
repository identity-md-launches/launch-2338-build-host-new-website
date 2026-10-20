import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
export function serve(root = 'dist') {
 const base = resolve(root);
 const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
 const server = createServer(async (req,res) => {
  try {
   const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/preview\//, '/');
   const file = resolve(base, '.' + (path.endsWith('/') ? path + 'index.html' : path));
   if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
   const body = await readFile(file);
   res.writeHead(200, {'Content-Type': types[extname(file)] ?? 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
 });
 return server;
}
if (process.argv[1]?.endsWith('preview.mjs')) {
 const server=serve(); server.listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173/preview/'));
}
