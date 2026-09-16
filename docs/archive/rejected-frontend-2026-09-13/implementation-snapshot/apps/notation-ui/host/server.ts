import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorService, RequestError } from './editor-service';
import { FileStore } from './file-store';

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 16_384) throw new RequestError('请求过大。', 413);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new RequestError('请求格式不正确。'); }
}

export function createUiServer(options: { addonPath: string; dataDirectory: string; assetsDirectory: string }) {
  const service = new EditorService(new FileStore(options.dataDirectory), options.addonPath);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const address = server.address();
    const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    try {
      if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
        json(response, 403, { error: '只允许本机工作台访问。' }); return;
      }
      const path = request.url ?? '/';
      if (request.method === 'GET' && path === '/api/state') { json(response, 200, service.read()); return; }
      if (request.method === 'GET' && path === '/api/files') { json(response, 200, service.files.list()); return; }
      if (request.method === 'GET' && path === '/api/health') { json(response, 200, service.evidence()); return; }
      if (request.method === 'POST' && path === '/api/action') {
        if (request.headers['content-type'] !== 'application/json' || request.headers['x-brilliant-client'] !== 'notation-ui-v1') {
          json(response, 403, { error: '操作请求来源不正确。' }); return;
        }
        json(response, 200, service.execute(await body(request))); return;
      }
      const assets: Record<string, readonly [string, string]> = {
        '/': ['index.html', 'text/html; charset=utf-8'],
        '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
        '/style.css': ['style.css', 'text/css; charset=utf-8'],
      };
      const asset = assets[path];
      if (request.method === 'GET' && asset) {
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
        response.end(readFileSync(join(options.assetsDirectory, asset[0]))); return;
      }
      json(response, 404, { error: '未找到此入口。' });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 400;
      json(response, status, { error: error instanceof Error ? error.message : '操作失败。', state: service.read() });
    }
  });
  return { server, service };
}
