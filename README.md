# arkcli-panel

中文 | [English](README.en.md)

[![CI](https://github.com/sharamcc/arkcli-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/sharamcc/arkcli-panel/actions/workflows/ci.yml)

BytePlus Ark 多子账户用量与接入点面板。只读工具，用 AK/SK 直接签名调用 Ark 控制平面，不依赖 `arkcli` CLI，也不使用浏览器 SSO。

- **用量**：账户级汇总、逐日柱状图、按接入点 / 按模型拆分
- **接入点**：列表、筛选、详情（只读，不含启停/删除）
- **账户**：新增、编辑、删除、凭证验证（写操作仅限本机）
- **刷新**：5 分钟自动轮询，页面隐藏时暂停，可手动刷新

## 安全模型（使用前先读）

这个工具处理 AK/SK，并且**没有登录认证**。默认行为如下，请勿在未理解的情况下改动：

| 项         | 默认行为                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| 监听地址   | `127.0.0.1`，仅本机可访问                                                                                     |
| 局域网访问 | 需显式设置 `PANEL_HOST=0.0.0.0`。开启后同网段任何人都能查看全部账户的用量与接入点                             |
| 写操作     | 新增/修改/删除账户仅接受来自 `127.0.0.1` 的请求，其他来源返回 403                                             |
| 凭证存储   | AK/SK 以明文 JSON 存于 `configs/accounts/*.json`，已被 `.gitignore` 排除                                      |
| Ark 调用   | 只读 Action 白名单：`GetInferenceUsage`、`ListEndpoints`、`GetEndpoint`、`ListFoundationModels`；其余一律拒绝 |
| 凭证回显   | 接口与界面只返回掩码 AK，SK 永不返回                                                                          |

**不要**把 `PANEL_HOST=0.0.0.0` 的服务暴露到公网或不可信网络。若需要局域网访问，建议配合反向代理与口令，或使用 Tailscale 等私有网络。

## 环境要求

- Node.js **>= 20.6**（`npm test` 使用 `node --import`）
- BytePlus 账号、IAM 子用户的 Access Key / Secret Key
- 该子用户需具备 Ark 只读权限（系统策略 `ArkReadOnlyAccess`），且授权范围覆盖你要查询的项目

## 快速开始

```bash
npm install

# 1. 创建账户配置（每个子账户一个文件）
cp configs/accounts.example.json configs/accounts/my-account.json
#    编辑该文件，填入 ak / sk / project

# 2. 构建并启动
npm run build
npm start
#    → http://127.0.0.1:3000
```

局域网访问：

```bash
PANEL_HOST=0.0.0.0 npm start
```

## 部署到 Linux（systemd）

仓库提供 [deploy/arkcli-panel.service](deploy/arkcli-panel.service)，默认安装到 `/opt/arkcli-panel`，以专用系统账户 `arkcli` 运行并监听 `127.0.0.1:3000`。

1. 安装 Node.js **>= 20.6**，确认 node 路径：

```bash
command -v node    # 常见为 /usr/bin/node；无输出说明未安装或不在 PATH
```

未安装时，Ubuntu/Debian 可用 NodeSource 装到 `/usr/bin/node`：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. 创建服务账户并拉取代码：

```bash
sudo useradd --system --user-group --home /opt/arkcli-panel --shell /usr/sbin/nologin arkcli
sudo mkdir -p /opt/arkcli-panel
sudo chown "$USER" /opt/arkcli-panel
git clone https://github.com/sharamcc/arkcli-panel.git /opt/arkcli-panel
```

3. 构建：

```bash
cd /opt/arkcli-panel
npm ci
npm run build
```

4. 准备账户配置，并把 `configs` 交给服务账户（面板写入账户与语言设置时需要）：

```bash
mkdir -p configs/accounts
cp configs/accounts.example.json configs/accounts/my-account.json
# 编辑 configs/accounts/my-account.json，填入 ak / sk / project
sudo chown -R arkcli:arkcli configs
```

5. 安装 unit，把 `ExecStart` 指向实际的 node 路径，然后启动：

```bash
NODE_BIN="$(command -v node)"
test -x "$NODE_BIN" || { echo "node 未安装或不在 PATH"; exit 1; }
sudo -u arkcli test -x "$NODE_BIN" || { echo "arkcli 无法执行 $NODE_BIN"; exit 1; }
sudo cp deploy/arkcli-panel.service /etc/systemd/system/
sudo sed -i "s|^ExecStart=.*|ExecStart=${NODE_BIN} dist/index.js|" /etc/systemd/system/arkcli-panel.service
sudo systemd-analyze verify /etc/systemd/system/arkcli-panel.service
sudo systemctl daemon-reload
sudo systemctl enable --now arkcli-panel
```

若 node 由 nvm 安装在 `/root` 或 `/home` 下，`arkcli` 账户通常无法访问，unit 的 `ProtectHome=true` 也会阻断执行；建议改用系统级安装的 Node（如 NodeSource 的 `/usr/bin/node`）。

6. 验证：

```bash
curl -s http://127.0.0.1:3000/health
journalctl -u arkcli-panel -f
```

日志出现 `status=203/EXEC` 时，表示 systemd 无法执行 `ExecStart`：核对 `command -v node`、`ls -l /opt/arkcli-panel/dist/index.js`，并用 `sudo -u arkcli test -x "$(command -v node)"` 确认服务账户可执行该 node。

升级：

```bash
cd /opt/arkcli-panel
git pull --ff-only
npm ci
npm run build
sudo systemctl restart arkcli-panel
```

需要局域网访问时，把 unit 中的 `PANEL_HOST` 改为 `0.0.0.0`，并先阅读上面的安全模型。若安装路径不是 `/opt/arkcli-panel`，需同时调整 `WorkingDirectory` 与 `ReadWritePaths`；安装在 `/home` 下时还要关闭 `ProtectHome`。

## 账户配置

文件路径为 `configs/accounts/<name>.json`，**文件名必须与 `name` 字段一致**。

| 字段        | 必填 | 说明                                                                                  |
| ----------- | ---- | ------------------------------------------------------------------------------------- |
| `name`      | 是   | 账户标识，只允许字母、数字、短横线；同时作为文件名                                    |
| `ak` / `sk` | 是   | IAM 子用户的 Access Key / Secret Key                                                  |
| `project`   | 否   | Ark 项目名，默认等于 `name`；**必须与 IAM 授权的项目一致**，否则会返回 `AccessDenied` |
| `label`     | 否   | 界面显示名称                                                                          |
| `region`    | 否   | 默认 `ap-southeast-1`                                                                 |
| `enabled`   | 否   | 默认 `true`；停用后不参与用量与接入点聚合                                             |
| `note`      | 否   | 备注                                                                                  |

## HTTP 接口

| 方法   | 路径                         | 说明                                                              | 来源限制 |
| ------ | ---------------------------- | ----------------------------------------------------------------- | -------- |
| GET    | `/api/accounts`              | 账户列表（AK 掩码）                                               | 全部     |
| POST   | `/api/accounts`              | 新增账户                                                          | 仅本机   |
| PUT    | `/api/accounts/:name`        | 更新账户（`sk` 留空表示不改）                                     | 仅本机   |
| DELETE | `/api/accounts/:name`        | 删除账户                                                          | 仅本机   |
| GET    | `/api/accounts/:name/verify` | 用 `ListEndpoints(PageSize=1)` 验证凭证与项目权限                 | 全部     |
| GET    | `/api/usage`                 | 多账户用量汇总，参数 `start`/`end`/`interval`/`account`/`project` | 全部     |
| GET    | `/api/usage/breakdown`       | 单账户接入点/模型明细，参数 `account`/`start`/`end`               | 全部     |
| GET    | `/api/endpoints`             | 接入点列表，支持 `account`/`status`/`name` 筛选                   | 全部     |
| GET    | `/api/endpoints/:id`         | 接入点详情                                                        | 全部     |
| GET    | `/api/models`                | 基础模型列表（当前未接入界面）                                    | 全部     |
| GET    | `/api/settings`              | 当前面板语言（`zh` / `en`）                                       | 全部     |
| POST   | `/api/settings/language`     | 切换面板语言，请求体 `{ "lang": "zh" \| "en" }`                   | 仅本机   |

响应统一为 `{ success, data, error? }`。

## 已知限制

- **查询区间必须小于 31 天**（Ark 限制）。界面在选定开始日期后自动取 31 天窗口，后端也会二次校验。
- **用量有 5–30 分钟延迟**，页面显示的「更新于」是本次查询时间，不是数据产生时间。
- **`/api/models` 在项目级授权下不可用**：`ListFoundationModels` 没有 `ProjectName` 参数，只能按 `project/*` 鉴权。需要账号级只读权限才能使用，目前界面未接入。
- **不保存历史数据**：没有数据库，趋势直接查询 Ark 的历史区间。
- **界面支持中文 / 英文**：侧栏底部切换，选择会被持久化，并同步决定后端日志与配置校验警告的语言。

## 开发

```bash
npm run dev     # 后端（Fastify，127.0.0.1:3000）
npm run web     # 前端（Vite，localhost:5173，代理 /api 到 3000）
npm run build   # 编译后端并构建前端到 web/dist
npm run typecheck   # 后端 + 前端类型检查
npm run lint        # ESLint
npm run format      # Prettier 格式化（format:check 只检查不改动）
npm test        # 聚合逻辑单元测试（node:test，无需额外依赖）
```

`npm install` 会通过 husky 安装 pre-commit 钩子：提交前对**暂存的文件**执行 `eslint --fix` 与 `prettier --write`，不通过则提交被阻止。跳过钩子（`--no-verify`）不在支持范围内。

## 获取 API Key

直连 BytePlus API Key。Seedance 2.0 mini / fast 版本正限时折扣中。欢迎私信 TG [@callxyabc_bot](https://t.me/callxyabc_bot) 咨询。

仅认 `@callxyabc_bot` 这个 handle，其他相似用户名均为仿冒。

## 许可证

[MIT](LICENSE)
