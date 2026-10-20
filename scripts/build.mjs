import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, rm, cp, readFile, writeFile } from 'node:fs/promises';
const deps = process.argv.includes('--deps') ? resolve(process.argv[process.argv.indexOf('--deps') + 1]) : resolve('.');
const require = createRequire(resolve(deps, 'package.json'));
const { build } = require('esbuild');
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await writeFile('dist/assets/site.css', (await readFile('src/brand-tokens.css', 'utf8')) + '\n' + (await readFile('src/styles.css', 'utf8')));
await build({ entryPoints: ['src/app.ts'], outfile: 'dist/assets/app.js', bundle: true,
  format: 'esm', platform: 'browser', target: ['es2022', 'safari16'], minify: true,
  nodePaths: [resolve(deps, 'node_modules')], legalComments: 'linked',
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true, logLevel: 'info'
});
console.log('Static export ready in dist/ (relative URLs).');
