# 安全策略

## 报告漏洞

请通过仓库的 **Security → Report a vulnerability**（GitHub Security Advisories）私密上报，不要开公开 issue。

报告中请包含：复现步骤、影响范围、以及你使用的版本。**不要在报告中粘贴真实的 AK/SK**，如需演示请使用占位凭证。

## 安全设计边界

以下行为是设计选择，不属于漏洞：

- **无登录认证**：直接运行 Node 时默认只监听 `127.0.0.1`；设置 `PANEL_HOST=0.0.0.0` 或使用 Docker 部署（由 nginx 发布 `HOST_PORT`，默认 80）后，同网段可读取全部账户的用量与接入点数据，这是使用者显式选择的结果。
- **写操作受来源白名单限制**：账户新增/修改/删除与语言设置只接受 `PANEL_WRITE_CIDRS` 内的来源，默认 `127.0.0.1/32,::1/128,192.168.9.0/24`；设为 `0.0.0.0/0` 等于放行所有 IPv4 来源。
- **凭证明文存储**：AK/SK 保存在 `configs/accounts/*.json`，依靠文件系统权限与 `.gitignore` 保护。
- **仅调用只读 Ark Action**：`GetInferenceUsage`、`ListEndpoints`、`GetEndpoint`、`ListFoundationModels`；其他 Action 在客户端白名单处直接拒绝。
- **用量数据延迟**：Ark 侧 5–30 分钟延迟，界面已标注。

## 属于安全问题的情形

- 绕过写操作来源白名单（例如伪造 `X-Forwarded-For` 让非白名单来源获得写权限，或绕过 `onRequest` 校验）
- 通过任意接口读取到 SK 明文
- 调用白名单之外的 Ark Action
- 路径穿越，导致可读取 `configs/accounts/` 之外的文件
- 在响应或日志中泄露凭证

## 支持的版本

仅对最新发布版本接受安全修复。预发布版本不提供保证。
