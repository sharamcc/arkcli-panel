# arkcli-panel Docker 化与 nginx 反向代理设计

- 日期：2026-10-27
- 状态：已实施（代码已合入 `main`，实施偏差见第 14 节）
- 更新：2026-10-31
- 范围：仓库容器化（Dockerfile / compose / nginx）、写来源白名单可配置化、文档与 CI 调整
- 不在范围：TLS、面板登录认证、GHCR 镜像分发、多架构镜像、nginx 直接托管静态资源

## 1. 背景与目标

当前 `arkcli-panel` 以 systemd 在 Ubuntu 24.04 上直接运行 Node 进程，仅监听 `127.0.0.1:3000`，局域网访问需要手工改 `PANEL_HOST`，且缺少统一入口与一键启停。

目标：

1. 用 Docker Compose 一键启动：nginx 容器对外提供 80 端口，app 容器只在内部网络提供 3000。
2. 写操作来源白名单可配置，默认 `192.168.9.0/24`，支持显式放开为 `0.0.0.0/0`。
3. 保留 systemd 作为无 Docker 环境的回退方案。
4. 部署方式、安全模型在 README 中英文同步说明。

## 2. 现状事实（已核实）

| 项       | 事实                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 服务器   | Ubuntu 24.04 LTS，磁盘 18G 可用，仅 22/25/53 端口监听，80 空闲             |
| Docker   | 未安装                                                                     |
| node     | `/usr/bin/node` v24.22.1                                                   |
| 服务账户 | `arkcli` uid=999 gid=990；`/opt/arkcli-panel/configs` 属主 `arkcli:arkcli` |
| 网段     | 服务器 `192.168.9.211/24`                                                  |
| 静态资源 | Fastify 从 `cwd/web/dist` 托管，含 SPA 回退与 `/api` 404 处理              |
| 写保护   | 仅 loopback 可写，见 `src/index.ts` 的 `LOOPBACK` 集合                     |
| 配置文件 | `configs/accounts/*.json`、`configs/settings.json` 已在 `.gitignore` 中    |
| systemd  | `arkcli-panel.service` 已 `enabled` 但当前 inactive（人为停止）            |

## 3. 决策记录

| #    | 决策           | 结论                                                                                       |
| ---- | -------------- | ------------------------------------------------------------------------------------------ |
| Q1   | 容器拓扑       | 两容器：nginx + app，app 不发布宿主端口                                                    |
| Q2   | 写操作策略     | 允许局域网写，`trustProxy` + 写来源白名单                                                  |
| Q3   | 镜像分发       | 服务器本地 `docker compose build`，CI 只做构建与冒烟校验                                   |
| Q4   | 端口与 TLS     | 80 纯 HTTP，README 预留 TLS 章节                                                           |
| Q5   | 运行身份       | 镜像内固定 `uid=999 / gid=990`，与宿主 arkcli 对齐                                         |
| Q6   | 默认写放行范围 | `192.168.9.0/24`                                                                           |
| Q7   | systemd 处置   | 保留 unit 与文档，执行 `systemctl disable --now` 作为备选                                  |
| Q8   | 静态托管       | 仍由 Fastify 托管，nginx 纯反向代理                                                        |
| Q9   | CI 校验深度    | `docker build` + `docker compose config` + 起容器打 `/health` 冒烟                         |
| 补充 | 写白名单可配置 | 环境变量 `PANEL_WRITE_CIDRS`，默认 `127.0.0.1/32,::1/128,192.168.9.0/24`，支持 `0.0.0.0/0` |

## 4. 架构

```
局域网浏览器 ──HTTP :80──> nginx 容器 (nginx:1.27-alpine, 唯一发布端口)
                              │ proxy_pass http://app:3000
                              │ X-Forwarded-For: $remote_addr（覆盖，不追加）
                              ▼
                          app 容器 (node:22-alpine, 不发布端口, uid=999/gid=990)
                              ├─ dist/index.js（Fastify）
                              ├─ web/dist（静态资源）
                              └─ ./configs:/app/configs（读写）
```

- 两个服务位于 compose 默认 bridge 网络，app 只通过服务名 `app` 被 nginx 访问。
- nginx 是唯一对外入口，宿主上仅暴露 `HOST_PORT`（默认 80）。

## 5. 新增与修改文件

| 文件                         | 类型 | 说明                                        |
| ---------------------------- | ---- | ------------------------------------------- |
| `Dockerfile`                 | 新增 | 三阶段构建，运行时非 root                   |
| `.dockerignore`              | 新增 | 排除依赖、产物、git、**configs**            |
| `compose.yaml`               | 新增 | app + nginx，健康检查、卷挂载、端口         |
| `deploy/nginx.conf`          | 新增 | 反向代理与转发头配置                        |
| `.env.example`               | 新增 | `HOST_PORT`、`PANEL_WRITE_CIDRS` 示例与注释 |
| `src/config/write-allow.ts`  | 新增 | CIDR 白名单解析与判定（纯函数）             |
| `test/write-allow.test.ts`   | 新增 | 白名单单元测试                              |
| `src/index.ts`               | 修改 | `trustProxy`、写来源判定替换                |
| `src/i18n/messages.ts`       | 修改 | 新增 `server.invalidWriteCidrs` 中英文案    |
| `package.json`               | 修改 | test 脚本改为运行整个 `test/` 目录          |
| `README.md` / `README.en.md` | 修改 | Docker 章节、安全模型、回退说明             |
| `.github/workflows/ci.yml`   | 修改 | 新增 docker job                             |

`deploy/arkcli-panel.service` 不改动。

## 6. 配置项

| 变量                | 默认值                                | 作用                                 |
| ------------------- | ------------------------------------- | ------------------------------------ |
| `HOST_PORT`         | `80`                                  | nginx 在宿主机发布的端口             |
| `PANEL_WRITE_CIDRS` | `127.0.0.1/32,::1/128,192.168.9.0/24` | 允许写操作的来源 CIDR 列表，逗号分隔 |

语义约定：

- `PANEL_WRITE_CIDRS` **整体替换**默认值，不做追加；因此自定义时应显式包含需要保留的本机地址。
- 空字符串或未设置时使用代码内默认值，默认值只在 `src/config/write-allow.ts` 定义一次。
- `0.0.0.0/0` 放行所有 IPv4 来源；如需同时放行 IPv6，需追加 `::/0`。
- 非法 CIDR 导致进程启动失败并输出错误日志，不做静默放行或静默拒绝。
- `PANEL_HOST`、`PORT` 由 compose 固定为 `0.0.0.0`、`3000`，不作为用户配置项。

## 7. 代码设计

### 7.1 `src/config/write-allow.ts`

使用 Node 内置 `node:net` 的 `BlockList`，不新增依赖。

```ts
import { BlockList } from 'node:net';

export const DEFAULT_WRITE_CIDRS = '127.0.0.1/32,::1/128,192.168.9.0/24';

export function buildWriteList(raw: string): BlockList;
export function isWriteAllowed(list: BlockList, ip: string): boolean;
```

`buildWriteList`：

- 按逗号切分、去空白、忽略空项。
- 每项格式 `address` 或 `address/prefix`；缺省前缀按地址族补全（IPv4 32，IPv6 128）。
- 前缀非整数或超出地址族范围时抛错。
- 地址格式非法由 `BlockList.addSubnet` 抛错。

`isWriteAllowed`：

- 去掉 `::ffff:` 映射前缀后再判定，兼容 Fastify 返回的 IPv4-mapped 地址。
- 按地址是否含 `:` 选择 `ipv4` / `ipv6` 类型。

### 7.2 `src/index.ts`

1. Fastify 实例增加 `trustProxy: true`，使 `request.ip` 取 `X-Forwarded-For` 中的真实客户端地址。安全性依赖两个前提：app 端口不发布到宿主；nginx 用 `$remote_addr` 覆盖写入 `X-Forwarded-For`。
2. 模块加载时解析 `PANEL_WRITE_CIDRS`，失败则记录 `server.invalidWriteCidrs` 日志并 `process.exit(1)`。
3. `onRequest` 钩子中的 `LOOPBACK.has(request.ip)` 替换为 `isWriteAllowed(writeList, request.ip)`。
4. 其余逻辑（403 错误码 `write.local_only`、路由、静态托管）不变。

### 7.3 i18n

新增键 `server.invalidWriteCidrs`：

- 中文：`写来源配置 PANEL_WRITE_CIDRS 非法：{value}（{message}）`
- 英文：`Invalid PANEL_WRITE_CIDRS: {value} ({message})`

## 8. 容器设计

### 8.1 Dockerfile

- `FROM node:22-alpine AS deps`：复制 `package.json`、`package-lock.json`，`npm ci --ignore-scripts`（跳过 husky 安装）。
- `FROM node:22-alpine AS build`：复用 deps 的 `node_modules`，复制源码，`npm run build`（tsc + vite）产出 `dist/` 与 `web/dist/`。
- `FROM node:22-alpine AS runtime`：
  - `ENV NODE_ENV=production PORT=3000 PANEL_HOST=0.0.0.0`
  - 创建组 `app` gid=990、用户 `app` uid=999
  - `npm ci --omit=dev --ignore-scripts` 安装生产依赖
  - 复制 `dist/`、`web/dist/`
  - `USER 999:990`，`EXPOSE 3000`，`CMD ["node", "dist/index.js"]`

选择 `node:22-alpine` 的理由：`engines` 最低 20.6，22 为 LTS，与 CI 矩阵一致。

### 8.2 `.dockerignore`

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

`configs/` 必须排除，防止 AK/SK 与 settings 进入镜像层。

### 8.3 compose.yaml

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

### 8.4 `deploy/nginx.conf`

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

`X-Forwarded-For` 使用 `$remote_addr` 覆盖而非追加，避免客户端伪造来源后被写白名单误放行。

## 9. 测试与 CI

### 9.1 单元测试 `test/write-allow.test.ts`

| 用例                                | 期望                   |
| ----------------------------------- | ---------------------- |
| 默认值 + `192.168.9.211`            | 允许                   |
| 默认值 + `127.0.0.1`、`::1`         | 允许                   |
| 默认值 + `10.0.0.5`、`192.168.10.1` | 拒绝                   |
| 默认值 + `::ffff:127.0.0.1`         | 允许（映射地址归一化） |
| `0.0.0.0/0` + `8.8.8.8`、`10.0.0.5` | 允许                   |
| `10.0.0.0/8` + `192.168.9.5`        | 拒绝（整体替换语义）   |
| `192.168.9.0/33`、`not-a-cidr`      | 抛错                   |

`package.json` 的 `test` 脚本改为 `node --import tsx --test test/`，使目录内所有测试文件被 CI 执行。

### 9.2 CI 新增 `docker` job

- `runs-on: ubuntu-24.04`，`needs: check`。
- 步骤：`docker build -t arkcli-panel:ci .` → `docker compose config` → `mkdir -p configs` → `HOST_PORT=18080 docker compose up -d --build` → 轮询 `http://127.0.0.1:18080/health` 最多 60 秒 → 失败输出 `docker compose logs` → 成功或失败均执行 `docker compose down -v`。

## 10. 服务器迁移步骤（实施阶段执行）

1. 安装 Docker Engine 与 compose plugin（Docker 官方 apt 源）；验证 `docker compose version`。
2. `sudo systemctl disable --now arkcli-panel`。
3. 处理服务器仓库工作区：`/opt/arkcli-panel/deploy/arkcli-panel.service` 存在本地改动（`PANEL_HOST=0.0.0.0`），迁移前还原该文件，避免 `git pull` 冲突。
4. `cd /opt/arkcli-panel && git pull`。
5. 按需创建 `.env`（从 `.env.example` 复制），确认 `configs/` 属主为 uid 999/gid 990。
6. `docker compose up -d --build`。
7. 验证：`docker compose ps` 均为 running/healthy；`curl http://127.0.0.1/health` 返回 200。

回退：

```bash
docker compose down
sudo systemctl enable --now arkcli-panel
```

unit 与 `dist/` 均未改动，可立即回退。

## 11. 验收标准

| #   | 检查                                                             | 通过条件                                        |
| --- | ---------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `docker compose up -d --build`                                   | 两个容器 running，app healthy                   |
| 2   | `curl http://127.0.0.1/health`                                   | 200 `{"status":"ok"}`                           |
| 3   | 局域网访问 `http://192.168.9.211/`                               | 页面正常，`/api/usage` 返回 200                 |
| 4   | 局域网 `POST /api/settings/language`                             | 200（改造前为 403），刷新后语言持久化           |
| 5   | 局域网账户增删改                                                 | 成功，`configs/accounts/` 落盘                  |
| 6   | `docker compose down` 后 `up -d`                                 | 账户与语言设置保留                              |
| 7   | 镜像不含凭证                                                     | 镜像内不存在 `/app/configs`                     |
| 8   | 容器运行身份                                                     | 镜像 `User` 为 `999:990`                        |
| 9   | 默认白名单下局域网写                                             | 200                                             |
| 10  | 默认白名单下非放行网段写                                         | 403 `write.local_only`                          |
| 11  | `PANEL_WRITE_CIDRS=0.0.0.0/0` 重启后写                           | 任意 IPv4 来源 200                              |
| 12  | `PANEL_WRITE_CIDRS=bad-value` 启动                               | 进程退出，日志含对应错误文案                    |
| 13  | `npm run lint` / `format:check` / `typecheck` / `test` / `build` | 全部通过，含新增测试                            |
| 14  | CI                                                               | check 与 docker 两个 job 均通过                 |
| 15  | 回退演练                                                         | `docker compose down` 后 systemd 服务可正常启动 |

## 12. 风险与取舍

- **写权限扩大**：默认放行 `192.168.9.0/24`，该网段内任何人可增删账户配置，无认证。设为 `0.0.0.0/0` 时，任何能连通 80 端口的来源均可写；若存在端口映射或公网暴露，等于公网匿名可写。README 必须显著标注。
- **读接口本就对局域网开放**：`sk` 完全隐藏、`ak` 仅显示前后 4 位，写风险集中在配置被篡改或删除。
- **`trustProxy: true`**：依赖「app 端口不发布」与「nginx 覆盖 XFF」两个前提，若将来发布 app 端口需同步收窄信任范围。
- **Docker daemon 等价 root**：服务器新增高权限组件，属容器化固有代价。
- **既有 systemd 部署方式**：保留但停用，长期存在两条路径的文档维护成本。

## 13. 后续步骤

1. 用户复核本设计文档。
2. 进入实现计划（writing-plans），拆分为可验证的步骤。
3. 编码与本地验证。
4. 经用户确认后提交、推送，并在服务器执行迁移与远程验证。

## 14. 实施记录（2026-10-31）

实现与设计的两处偏差，以代码为准：

1. **`trustProxy`**：未使用固定 `true`，改为 `process.env.PANEL_TRUSTED_PROXIES?.trim() || false`；compose 将 `PANEL_TRUSTED_PROXIES` 设为 `${PANEL_SUBNET:-172.28.0.0/24}`，直连运行未设置时只认 socket 地址。比原设计更窄的信任范围，见 `src/index.ts` 与 `compose.yaml`。
2. **IPv4-mapped 归一化**：`isWriteAllowed` 不再手工剥离 `::ffff:` 前缀，由 Node `BlockList` 内部完成映射，判定语义不变（`test/write-allow.test.ts` 覆盖）。

其余（目录结构、配置项语义、CI job、README 说明）按设计落地。
