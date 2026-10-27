import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getLang, setLang } from '../config/settings.js';

const schema = z.object({ lang: z.enum(['zh', 'en']) });

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    return { success: true, data: { lang: getLang() } };
  });

  // 面板切换语言时回写，使后端日志与配置校验警告跟随同一语言
  app.post('/api/settings/language', async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, code: 'validation', error: parsed.error.flatten().fieldErrors });
    }
    setLang(parsed.data.lang);
    return { success: true, data: { lang: parsed.data.lang } };
  });
}
