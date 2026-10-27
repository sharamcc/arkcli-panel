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

// 写操作仅允许本机访问：无认证前提下，避免局域网内他人篡改账户配置
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const app = Fastify({ logger: true });

app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (!LOOPBACK.has(request.ip)) {
    return reply
      .status(403)
      .send({ success: false, code: 'write.local_only', error: '写操作仅允许本机访问' });
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
