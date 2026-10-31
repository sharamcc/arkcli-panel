# arkcli-panel Docker 化与 nginx 反向代理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Docker Compose 一键启动 `arkcli-panel`（nginx 反代 + Node app），写操作来源白名单可通过 `PANEL_WRITE_CIDRS` 配置。

**Architecture:** nginx 容器是唯一对外入口（发布 `HOST_PORT`，默认 80），反向代理到仅在内网可达的 app 容器；app 以 uid 999/gid 990 运行并读写挂载的 `configs/`。后端的写保护由 loopback 硬编码改为可配置 CIDR 白名单，并开启 `trustProxy` 读取 nginx 覆盖写入的真实来源地址。

**Tech Stack:** Node 22（Fastify 5、TypeScript）、React/Vite、Docker multi-stage、nginx:1.27-alpine、GitHub Actions、node:test。

**Git 规则（覆盖本计划中的提交步骤）：** 每个 Commit 步骤执行前必须获得用户明确同意，禁止 `git add -A`，禁止 `--no-verify`。

**进度（2026-10-31）：** Task 1–6 已完成并合入 `main`：`src/config/write-allow.ts`、`Dockerfile`、`.dockerignore`、`compose.yaml`、`deploy/nginx.conf`、`.env.example`、CI 的 docker job、README 中英文均已就位；lint / format / typecheck / test / build 与 `docker compose config` 由 CI 的 check + docker job 覆盖。实施偏差：`src/index.ts` 的 `trustProxy` 并非固定 `true`，而是取 `PANEL_TRUSTED_PROXIES`（compose 默认用 `PANEL_SUBNET`，即 `172.28.0.0/24`），未设置时直连只认 socket 地址。未勾选项为需 Docker 运行时或远程服务器的验证步骤，本仓库无执行留痕。

---

## 文件结构

| 文件                         | 职责                                      |
| ---------------------------- | ----------------------------------------- |
| `src/config/write-allow.ts`  | CIDR 白名单解析与来源判定，纯函数         |
| `test/write-allow.test.ts`   | 上述模块的单元测试                        |
| `src/index.ts`               | 组装 Fastify、写保护钩子、静态托管        |
| `src/i18n/messages.ts`       | 后端日志文案（新增非法 CIDR 提示）        |
| `web/src/i18n.tsx`           | 前端错误码文案（更新 `write.local_only`） |
| `Dockerfile`                 | 三阶段构建，运行时非 root                 |
| `.dockerignore`              | 构建上下文排除清单（含 `configs/`）       |
| `compose.yaml`               | app + nginx 编排                          |
| `deploy/nginx.conf`          | 反向代理与转发头                          |
| `.env.example`               | 端口与写白名单示例                        |
| `.gitignore`                 | 增加 `!.env.example` 例外                 |
| `README.md` / `README.en.md` | Docker 部署、安全模型、回退说明           |
| `.github/workflows/ci.yml`   | 新增 docker job                           |

---

### Task 1: 写来源白名单模块（TDD）

**Files:**

- Create: `src/config/write-allow.ts`
- Create: `test/write-allow.test.ts`
- Modify: `package.json:21`（`test` 脚本）

- [x] **Step 1: 让测试脚本覆盖整个目录**

`package.json` 中把：

```json
"test": "node --import tsx --test test/breakdown-service.test.ts",
```

改为：

```json
"test": "node --import tsx --test test/*.test.ts",
```

- [x] **Step 2: 写失败测试**

创建 `test/write-allow.test.ts`：

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWriteList, DEFAULT_WRITE_CIDRS, isWriteAllowed } from '../src/config/write-allow.js';

test('默认白名单放行内网与本机', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '192.168.9.211'), true);
  assert.equal(isWriteAllowed(list, '192.168.9.42'), true);
  assert.equal(isWriteAllowed(list, '127.0.0.1'), true);
  assert.equal(isWriteAllowed(list, '::1'), true);
});

test('默认白名单拒绝其他网段', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '10.0.0.5'), false);
  assert.equal(isWriteAllowed(list, '192.168.10.1'), false);
});

test('IPv4-mapped IPv6 地址归一化', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '::ffff:127.0.0.1'), true);
});

test('0.0.0.0/0 放行任意 IPv4', () => {
  const list = buildWriteList('0.0.0.0/0');
  assert.equal(isWriteAllowed(list, '8.8.8.8'), true);
  assert.equal(isWriteAllowed(list, '10.0.0.5'), true);
});

test('自定义值整体替换默认值', () => {
  const list = buildWriteList('10.0.0.0/8');
  assert.equal(isWriteAllowed(list, '10.1.2.3'), true);
  assert.equal(isWriteAllowed(list, '192.168.9.5'), false);
});

test('非法 CIDR 抛错', () => {
  assert.throws(() => buildWriteList('192.168.9.0/33'));
  assert.throws(() => buildWriteList('not-a-cidr'));
});
```

- [x] **Step 3: 运行测试确认失败**

Run: `npm test`

Expected: FAIL，报错包含 `Cannot find module` 与 `write-allow`。

- [x] **Step 4: 实现模块**

创建 `src/config/write-allow.ts`：

```ts
import { BlockList } from 'node:net';

// 默认仅本机与内网段可写；PANEL_WRITE_CIDRS 会整体替换该默认值
export const DEFAULT_WRITE_CIDRS = '127.0.0.1/32,::1/128,192.168.9.0/24';

export function buildWriteList(raw: string): BlockList {
  const list = new BlockList();
  for (const entry of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [addr, prefixText] = entry.split('/');
    const type = addr.includes(':') ? 'ipv6' : 'ipv4';
    const maxPrefix = type === 'ipv6' ? 128 : 32;
    const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`invalid CIDR: ${entry}`);
    }
    list.addSubnet(addr, prefix, type);
  }
  return list;
}

export function isWriteAllowed(list: BlockList, ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return list.check(normalized, normalized.includes(':') ? 'ipv6' : 'ipv4');
}
```

- [x] **Step 5: 运行测试确认通过**

Run: `npm test`

Expected: PASS，全部用例通过（含既有 `breakdown-service` 用例）。

- [x] **Step 6: 格式化与静态检查**

Run: `npx prettier --write src/config/write-allow.ts test/write-allow.test.ts package.json && npm run lint && npm run typecheck`

Expected: 无报错。

- [x] **Step 7: 提交（需用户确认）**

```bash
git add src/config/write-allow.ts test/write-allow.test.ts package.json
git commit -m "feat: 写来源白名单支持 CIDR 配置"
```

---

### Task 2: 接入写白名单与 trustProxy

**Files:**

- Modify: `src/index.ts:13-25`
- Modify: `src/i18n/messages.ts:15-22`
- Modify: `web/src/i18n.tsx:51`、`web/src/i18n.tsx:214`

- [x] **Step 1: 新增后端日志文案**

在 `src/i18n/messages.ts` 的 `MESSAGES` 中，`server.webDistMissing` 之后插入：

```ts
  'server.invalidWriteCidrs': {
    zh: '写来源配置 PANEL_WRITE_CIDRS 非法：{value}（{message}）',
    en: 'Invalid PANEL_WRITE_CIDRS: {value} ({message})',
  },
```

- [x] **Step 2: 替换写保护逻辑**

`src/index.ts` 顶部导入区新增：

```ts
import { buildWriteList, DEFAULT_WRITE_CIDRS, isWriteAllowed } from './config/write-allow.js';
```

将原有的 `LOOPBACK` 常量与 `Fastify` 初始化、`onRequest` 钩子（第 13-25 行）整体替换为：

```ts
const app = Fastify({ logger: true, trustProxy: true });

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
```

- [x] **Step 3: 更新前端错误文案（两处）**

`web/src/i18n.tsx` 第 51 行与第 214 行的 `'error.write_local_only'` 都改为：

```ts
  'error.write_local_only': 'Write operations are not allowed from this source',
```

- [ ] **Step 4: 构建并验证写来源判定**

```bash
npm run build
PORT=3100 PANEL_HOST=127.0.0.1 node dist/index.js & PID=$!
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3100/api/settings/language -H 'Content-Type: application/json' -d '{"lang":"zh"}'
kill "$PID"
```

Expected: 输出 `200`。

```bash
PORT=3100 PANEL_HOST=127.0.0.1 PANEL_WRITE_CIDRS=10.0.0.0/8 node dist/index.js & PID=$!
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3100/api/settings/language -H 'Content-Type: application/json' -d '{"lang":"zh"}'
kill "$PID"
```

Expected: 输出 `403`。

```bash
PANEL_WRITE_CIDRS=bad-value node dist/index.js; echo "exit=$?"
```

Expected: 输出 `exit=1`，日志含「写来源配置 PANEL_WRITE_CIDRS 非法」。

- [x] **Step 5: 质量门**

Run: `npx prettier --write src/index.ts src/i18n/messages.ts web/src/i18n.tsx && npm run lint && npm run typecheck && npm test`

Expected: 全部通过。

- [x] **Step 6: 提交（需用户确认）**

```bash
git add src/index.ts src/i18n/messages.ts web/src/i18n.tsx
git commit -m "feat: 写保护改为可配置 CIDR 白名单并信任反代来源"
```

---

### Task 3: Dockerfile 与构建上下文

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`

- [x] **Step 1: 写 Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PANEL_HOST=0.0.0.0
RUN addgroup -g 990 -S app && adduser -S -D -H -u 999 -G app app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
USER 999:990
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [x] **Step 2: 写 `.dockerignore`**

```
node_modules/
dist/
web/dist/
.git/
.github/
configs/
test/
docs/
.screenshots/
.taste-skill/
*.log
.DS_Store
```

- [ ] **Step 3: 构建镜像**

Run: `docker build -t arkcli-panel:dev .`

Expected: 构建成功，最终镜像 tag `arkcli-panel:dev`。

- [ ] **Step 4: 验证镜像身份与凭证隔离**

```bash
docker run --rm arkcli-panel:dev id
docker run --rm arkcli-panel:dev sh -c 'ls /app; ls /app/configs 2>&1 || true'
```

Expected: `uid=999(app) gid=990(app)`；`/app` 下只有 `dist`、`node_modules`、`package.json`、`package-lock.json`、`web`；`/app/configs` 提示 `No such file or directory`。

- [ ] **Step 5: 容器冒烟**

```bash
docker run -d --rm --name arkcli-smoke -p 18080:3000 -v "$PWD/configs:/app/configs" arkcli-panel:dev
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/
docker stop arkcli-smoke
```

Expected: 两个 `200`。

- [x] **Step 6: 提交（需用户确认）**

```bash
git add Dockerfile .dockerignore
git commit -m "build: 增加多阶段 Dockerfile 与非 root 运行镜像"
```

---

### Task 4: nginx 反代与 compose 编排

**Files:**

- Create: `deploy/nginx.conf`
- Create: `compose.yaml`
- Create: `.env.example`
- Modify: `.gitignore:4-5`

- [x] **Step 1: 写 nginx 配置**

创建 `deploy/nginx.conf`：

```nginx
server {
    listen 80;
    server_name _;
    server_tokens off;
    client_max_body_size 1m;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [x] **Step 2: 写 compose 编排**

创建 `compose.yaml`：

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      PANEL_WRITE_CIDRS: ${PANEL_WRITE_CIDRS:-}
    volumes:
      - ./configs:/app/configs
    expose:
      - '3000'
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:3000/health']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - '${HOST_PORT:-80}:80'
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      app:
        condition: service_healthy
```

- [x] **Step 3: 写 `.env.example` 并放行该文件**

创建 `.env.example`：

```
# nginx 在宿主机发布的端口
HOST_PORT=80

# 允许写操作的来源 CIDR，逗号分隔，整体替换代码内默认值
# 默认：127.0.0.1/32,::1/128,192.168.9.0/24
# 放行所有 IPv4（任何能连到该端口的来源都可增删账户配置）：0.0.0.0/0
PANEL_WRITE_CIDRS=127.0.0.1/32,::1/128,192.168.9.0/24
```

修改 `.gitignore`，在 `.env.*` 之后新增一行：

```
!.env.example
```

- [ ] **Step 4: 校验编排文件**

Run: `docker compose config`

Expected: 输出解析后的完整 YAML，无报错；`app` 的 `PANEL_WRITE_CIDRS` 为空字符串。

- [ ] **Step 5: 启动并验证**

```bash
HOST_PORT=18080 docker compose up -d --build
sleep 15
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:18080/api/settings/language -H 'Content-Type: application/json' -d '{"lang":"zh"}'
docker compose logs --tail 5 app
```

Expected: `app` 为 `healthy`；三个请求依次为 `200`、`200`、`200`；app 日志中 `remoteAddress` 为 `127.0.0.1`（证明 `trustProxy` 生效而非容器网关 IP）。

- [ ] **Step 6: 停止并清理**

Run: `docker compose down`

Expected: 两个容器移除，`configs/` 保留。

- [x] **Step 7: 提交（需用户确认）**

```bash
git add deploy/nginx.conf compose.yaml .env.example .gitignore
git commit -m "feat: 增加 nginx 反代与 docker compose 一键启动"
```

---

### Task 5: README 中英文更新

**Files:**

- Modify: `README.md:11-27`、`README.md:29-33`、`README.md:56`
- Modify: `README.en.md:11-27`、`README.en.md:29-33`、`README.en.md:56`

- [x] **Step 1: 更新中文安全模型与特性说明**

`README.md` 第 11 行改为：

```markdown
- **账户**：新增、编辑、删除、凭证验证（写操作来源由 `PANEL_WRITE_CIDRS` 控制）
```

安全模型表格三行改为：

```markdown
| 监听地址 | 容器内 `0.0.0.0`，仅 nginx 发布 `HOST_PORT`（默认 80）；直接运行 Node 时默认 `127.0.0.1` |
| 局域网访问 | Docker 部署默认对局域网开放；直接运行 Node 需显式设置 `PANEL_HOST=0.0.0.0`。开启后同网段任何人都能查看全部账户的用量与接入点 |
| 写操作 | 仅接受 `PANEL_WRITE_CIDRS` 白名单内的来源，默认 `127.0.0.1/32,::1/128,192.168.9.0/24`，其他来源返回 403 |
```

第 27 行警示段落改为：

```markdown
**不要**把服务暴露到公网或不可信网络。`PANEL_WRITE_CIDRS=0.0.0.0/0` 会放行所有 IPv4 来源，只有在确认端口未暴露到公网时才可使用；需要更强的边界时，请把 compose 的端口映射改为 `192.168.9.211:80:80` 或改用私有网络。
```

环境要求新增一条：

```markdown
- Docker Engine + compose plugin（使用 Docker 部署时；`docker compose version` 可用）
```

- [x] **Step 2: 插入中文 Docker 章节**

在 `## 部署到 Linux（systemd）` 之前插入：

````markdown
## Docker 部署（推荐）

前置：Docker Engine 与 compose plugin（Ubuntu 可参考官方 apt 源安装），确认 `docker compose version` 可用。

```bash
cp .env.example .env      # 按需修改 HOST_PORT 与 PANEL_WRITE_CIDRS
mkdir -p configs/accounts
cp configs/accounts.example.json configs/accounts/my-account.json   # 填入 ak / sk / project
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1/health
```

局域网访问 `http://<服务器IP>/`。

```bash
docker compose logs -f app     # 后端日志
docker compose logs -f nginx   # 反向代理日志
docker compose down            # 停止
docker compose up -d --build   # 升级后重建
```

`configs/` 以读写方式挂载进容器，账户与语言设置持久化在宿主机；容器以 uid 999 / gid 990 运行，目录属主需一致：

```bash
sudo chown -R 999:990 configs
```

回退到 systemd：

```bash
docker compose down
sudo systemctl enable --now arkcli-panel
```
````

并把 `## 部署到 Linux（systemd）` 标题改为 `## 部署到 Linux（systemd，无 Docker 环境备选）`。

- [x] **Step 3: 更新英文版本**

`README.en.md` 第 11 行改为：

```markdown
- **Accounts**: create, edit, delete, credential verification (write sources controlled by `PANEL_WRITE_CIDRS`)
```

安全模型表格三行改为：

```markdown
| Listen address | `0.0.0.0` inside the container; only nginx publishes `HOST_PORT` (80 by default). Plain `node` defaults to `127.0.0.1` |
| LAN access | Open to the LAN in Docker mode; plain `node` needs `PANEL_HOST=0.0.0.0`. Anyone on the same network can read usage and endpoints |
| Write operations | Only sources inside `PANEL_WRITE_CIDRS` may create/update/delete accounts; default `127.0.0.1/32,::1/128,192.168.9.0/24`, other sources get 403 |
```

第 27 行改为：

```markdown
**Do not** expose the service to the public internet or untrusted networks. `PANEL_WRITE_CIDRS=0.0.0.0/0` allows every IPv4 source; use it only when the port is not reachable from the internet. For a tighter boundary, bind compose to a LAN address such as `192.168.9.211:80:80` or use a private network.
```

环境要求新增：

```markdown
- Docker Engine + compose plugin (for Docker deployment; `docker compose version` must work)
```

- [x] **Step 4: 插入英文 Docker 章节**

在 `## Deploy on Linux (systemd)` 之前插入：

````markdown
## Docker deployment (recommended)

Requires Docker Engine and the compose plugin (`docker compose version` must work).

```bash
cp .env.example .env      # adjust HOST_PORT and PANEL_WRITE_CIDRS as needed
mkdir -p configs/accounts
cp configs/accounts.example.json configs/accounts/my-account.json   # fill in ak / sk / project
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1/health
```

LAN access: `http://<server-ip>/`.

```bash
docker compose logs -f app     # app logs
docker compose logs -f nginx   # reverse proxy logs
docker compose down            # stop
docker compose up -d --build   # rebuild after upgrade
```

`configs/` is mounted read-write so accounts and language settings persist on the host; the container runs as uid 999 / gid 990, so the directory must match:

```bash
sudo chown -R 999:990 configs
```

Roll back to systemd:

```bash
docker compose down
sudo systemctl enable --now arkcli-panel
```
````

并把 `## Deploy on Linux (systemd)` 标题改为 `## Deploy on Linux (systemd, fallback without Docker)`。

- [x] **Step 5: 格式检查**

Run: `npx prettier --check README.md README.en.md && git diff --check`

Expected: 全部通过。

- [x] **Step 6: 提交（需用户确认）**

```bash
git add README.md README.en.md
git commit -m "docs: 增加 Docker 部署与写来源白名单说明"
```

---

### Task 6: CI 增加 Docker 校验

**Files:**

- Modify: `.github/workflows/ci.yml`（文件末尾追加 job）

- [x] **Step 1: 追加 docker job**

在 `ci.yml` 末尾追加：

```yaml
docker:
  name: Docker
  runs-on: ubuntu-24.04
  needs: check

  steps:
    - name: Checkout
      uses: actions/checkout@v5

    - name: Build image
      run: docker build -t arkcli-panel:ci .

    - name: Validate compose file
      run: docker compose config

    - name: Smoke test
      run: |
        mkdir -p configs
        HOST_PORT=18080 docker compose up -d --build
        for i in $(seq 1 30); do
          if curl -fsS http://127.0.0.1:18080/health; then
            echo "healthy"
            break
          fi
          sleep 2
        done
        curl -fsS http://127.0.0.1:18080/health > /dev/null
        docker compose logs

    - name: Cleanup
      if: always()
      run: docker compose down -v
```

- [x] **Step 2: 本地校验 YAML 与编排**

Run: `npx prettier --check .github/workflows/ci.yml && docker compose config > /dev/null`

Expected: 无报错。

- [x] **Step 3: 提交（需用户确认）**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 增加 Docker 构建与容器冒烟校验"
```

---

### Task 7: 服务器迁移与验收

**前置：** 用户明确同意执行远程操作；服务器当前未安装 Docker。

- [ ] **Step 1: 安装 Docker Engine 与 compose plugin**

```bash
ssh arkcli-panel 'set -e
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker compose version'
```

Expected: 输出 compose 版本号。

- [ ] **Step 2: 停用 systemd 服务**

```bash
ssh arkcli-panel 'sudo systemctl disable --now arkcli-panel && systemctl is-active arkcli-panel || true'
```

Expected: 输出 `inactive`。

- [ ] **Step 3: 清理服务器工作区并拉取代码**

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && git checkout -- deploy/arkcli-panel.service && git status --short && git pull'
```

Expected: `git status --short` 为空；`git pull` 快进到最新 `main`。

- [ ] **Step 4: 准备配置与环境变量**

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && { [ -f .env ] || cp .env.example .env; } && sudo chown -R 999:990 configs && ls -ln configs'
```

Expected: `configs` 及子项属主显示 `999 990`，`.env` 存在。

- [ ] **Step 5: 启动容器**

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && sudo docker compose up -d --build && sleep 15 && sudo docker compose ps'
```

Expected: `app` 与 `nginx` 均 running，`app` 为 healthy。

- [ ] **Step 6: 本机与局域网验收**

```bash
ssh arkcli-panel 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/health'
```

Expected: `200`。

在局域网另一台机器执行：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://192.168.9.211/
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://192.168.9.211/api/settings/language -H 'Content-Type: application/json' -d '{"lang":"zh"}'
```

Expected: 两个 `200`（改造前第二个为 `403`）。

- [ ] **Step 7: 持久化与回退验收**

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && sudo docker compose down && sudo docker compose up -d && sleep 5 && sudo docker compose ps'
```

Expected: 重建后账户与语言设置仍在；`/health` 仍为 200。

回退演练（仅在用户要求时执行）：

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && sudo docker compose down && sudo systemctl enable --now arkcli-panel && systemctl is-active arkcli-panel'
```

Expected: 输出 `active`。

- [ ] **Step 8: 汇总验收结果**

对照设计文档第 11 节 15 项逐条记录结果；任一项失败则回到对应 Task 修复，不带病提交。

---

## Self-Review

- **Spec coverage：** 架构与文件清单对应 Task 3、4；配置项与代码设计对应 Task 1、2；测试与 CI 对应 Task 1、6；README 对应 Task 5；迁移、回退与验收对应 Task 7。设计文档第 11 节 15 项验收全部映射到 Task 2、3、4、5、6、7 的验证步骤。
- **Placeholder scan：** 无 TBD/TODO，所有代码与命令均为最终内容。
- **Type consistency：** `buildWriteList`、`isWriteAllowed`、`DEFAULT_WRITE_CIDRS` 在 Task 1 定义，Task 2 按同名导入使用；`PANEL_WRITE_CIDRS`、`HOST_PORT` 在 Task 4 与环境变量命名一致；`write.local_only` 错误码在 Task 2 保持不变。
- **已知取舍：** Task 7 为部署任务，不产生代码提交；服务器 `/opt/arkcli-panel` 的 `deploy/arkcli-panel.service` 本地改动在迁移前还原。
