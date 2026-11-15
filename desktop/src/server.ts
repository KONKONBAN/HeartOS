import http from 'node:http';
import os from 'node:os';
import type { HubCore } from '../../src/core/hublink/hubcore';
import type { Envelope, PairRequest } from '../../src/core/hublink/protocol';

const MAX_BODY = 16 * 1024 * 1024;

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Gói tin quá lớn'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(new Error('JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function startHubServer(hub: HubCore, port: number, host = '0.0.0.0'): Promise<RunningServer> {
  const hits = new Map<string, number[]>();
  const limited = (ip: string) => {
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < 10_000);
    list.push(now);
    hits.set(ip, list);
    return list.length > 60;
  };
  const server = http.createServer(async (req, res) => {
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const url = new URL(req.url ?? '/', 'http://hub');
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (limited(ip)) return send(res, 429, { error: 'Quá nhiều yêu cầu' });
    try {
      if (req.method === 'GET' && url.pathname === '/api/v1/hello') {
        const v = hub.view();
        return send(res, 200, { product: 'HeartOS Sentinel Admin', protocol: 1, name: hub.name, pairing: !!v.pairing, signPub: hub.signPub });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/pair') {
        const r = await hub.handlePair((await readBody(req)) as PairRequest, ip);
        return r.ok ? send(res, 200, r.response) : send(res, r.status, { error: r.reason });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/sync') {
        const r = await hub.handleSync((await readBody(req)) as Envelope, ip);
        return r.ok ? send(res, 200, r.response) : send(res, r.status, { error: r.reason });
      }
      return send(res, 404, { error: 'Không có đường dẫn này' });
    } catch (e) {
      return send(res, 400, { error: (e as Error).message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
