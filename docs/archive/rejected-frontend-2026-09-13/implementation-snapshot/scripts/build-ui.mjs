import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('dist-ui/public', { recursive: true });
await build({ entryPoints: ['apps/notation-ui/host/main.ts'], outfile: 'dist-ui/server.cjs', bundle: true, platform: 'node', target: 'node24' });
await build({ entryPoints: ['apps/notation-ui/browser/main.ts'], outfile: 'dist-ui/public/app.js', bundle: true, platform: 'browser', target: 'es2022', minify: true, metafile: true }).then(async result => {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('dist-ui/browser-meta.json', JSON.stringify(result.metafile, null, 2));
});
for (const name of ['index.html', 'style.css']) copyFileSync(resolve('apps/notation-ui/public', name), resolve('dist-ui/public', name));
const tests = readdirSync('test/notation-ui').filter(name => name.endsWith('.test.ts')).map(name => `test/notation-ui/${name}`);
if (tests.length) await build({ entryPoints: tests, outdir: 'dist-ui/tests', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', target: 'node24' });
console.log('UI host, registered notation plugin, and focused tests built.');
