import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { accountRoutes } from './routes/accounts.js';
import { usageRoutes } from './routes/usage.js';
import { usageBreakdownRoutes } from './routes/usage-breakdown.js';
import { endpointRoutes } from './routes/endpoints.js';
import { modelRoutes } from './routes/models.js';
import { settingsRoutes } from './routes/settings.js';
import { tm } from './i18n/messages.js';
import { buildWriteList, DEFAULT_WRITE_CIDRS, isWriteAllowed } from './config/write-allow.js';

const app = Fastify({
  logger: true,
  // 仅当显式配置可信代理网段时才采信 X-Forwarded-For；直连运行默认只认 socket 地址
  trustProxy: process.env.PANEL_TRUSTED_PROXIES?.trim() || false,
});

// 写操作来源白名单：默认本机 + 内网段，PANEL_WRITE_CIDRS 可整体替换（0.0.0.0/0 放行所有 IPv4）
const writeCidrs = process.env.PANEL_WRITE_CIDRS?.trim() || DEFAULT_WRITE_CIDRS;
const writeList = (() => {
  try {
    return buildWriteList(writeCidrs);
  } catch (err) {
    app.log.error(
      tm('server.invalidWriteCidrs', { value: writeCidrs, message: (err as Error).message }),
    );
    process.exit(1);
  }
})();

app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (!isWriteAllowed(writeList, request.ip)) {
    return reply
      .status(403)
      .send({ success: false, code: 'write.local_only', error: '写操作来源不在允许范围内' });
  }
});

app.register(accountRoutes);
app.register(usageRoutes);
app.register(usageBreakdownRoutes);
app.register(endpointRoutes);
app.register(modelRoutes);
app.register(settingsRoutes);

app.get('/health', async () => ({ status: 'ok' }));

// 生产模式下由同一个进程托管前端构建产物
const webDist = path.resolve(process.cwd(), 'web', 'dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.status(404).send({ success: false, code: 'not_found', error: '接口不存在' });
    }
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(tm('server.webDistMissing'));
}

const port = Number(process.env.PORT ?? 3000);
// 默认仅监听本机；需要局域网访问时显式设置 PANEL_HOST=0.0.0.0
const host = process.env.PANEL_HOST ?? '127.0.0.1';

try {
  await app.listen({ port, host });
  app.log.info(tm('server.listening', { host, port }));
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
