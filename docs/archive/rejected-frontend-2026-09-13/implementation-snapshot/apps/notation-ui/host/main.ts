import { resolve } from 'node:path';
import { createUiServer } from './server';

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name); return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};
const dataDirectory = resolve(arg('--data', '.local-evidence/notation-ui/documents'));
const { server, service } = createUiServer({
  addonPath: arg('--addon', 'target/integrated-v2/brilliant_kernel_node.node'),
  assetsDirectory: resolve('dist-ui/public'), dataDirectory,
});
server.listen(Number(arg('--port', '4318')), '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4318}`, dataDirectory, ...service.evidence() }) + '\n');
});
server.on('error', error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
const stop = () => { server.close(); server.closeIdleConnections(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
