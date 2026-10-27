# arkcli-panel

[中文](README.md) | English

[![CI](https://github.com/sharamcc/arkcli-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/sharamcc/arkcli-panel/actions/workflows/ci.yml)

A read-only multi-sub-account usage and endpoint panel for BytePlus Ark. It signs requests to the Ark control plane with AK/SK directly — no `arkcli` CLI and no browser SSO.

- **Usage**: account-level totals, daily bar chart, breakdown by endpoint / by model
- **Endpoints**: list, filter, detail (read-only, no start/stop/delete)
- **Accounts**: create, edit, delete, credential verification (writes are local-only)
- **Refresh**: polls every 5 minutes, pauses when the page is hidden, manual refresh available

## Security model (read before use)

This tool handles AK/SK and has **no login authentication**. Defaults are listed below — do not change them without understanding the consequences:

| Item             | Default behavior                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Listen address   | `127.0.0.1`, local machine only                                                                                                      |
| LAN access       | Requires explicit `PANEL_HOST=0.0.0.0`. Once enabled, anyone on the same network can see usage and endpoints of every account        |
| Write operations | Creating/updating/deleting accounts only accepts requests from `127.0.0.1`; other sources get 403                                    |
| Credential store | AK/SK stored as plaintext JSON in `configs/accounts/*.json`, excluded by `.gitignore`                                                |
| Ark calls        | Read-only action allowlist: `GetInferenceUsage`, `ListEndpoints`, `GetEndpoint`, `ListFoundationModels`; everything else is rejected |
| Credential echo  | APIs and UI only return a masked AK; the SK is never returned                                                                        |

**Do not** expose a `PANEL_HOST=0.0.0.0` instance to the public internet or untrusted networks. For LAN access, put it behind a reverse proxy with a password, or use a private network such as Tailscale.

## Requirements

- Node.js **>= 20.6** (`npm test` uses `node --import`)
- A BytePlus account and an IAM sub-user Access Key / Secret Key
- The sub-user must have Ark read-only permissions (system policy `ArkReadOnlyAccess`), scoped to the projects you want to query

## Quick start

```bash
npm install

# 1. Create an account config (one file per sub-account)
cp configs/accounts.example.json configs/accounts/my-account.json
#    Edit the file: fill in ak / sk / project

# 2. Build and start
npm run build
npm start
#    → http://127.0.0.1:3000
```

LAN access:

```bash
PANEL_HOST=0.0.0.0 npm start
```

## Deploy on Linux (systemd)

The repo ships [deploy/arkcli-panel.service](deploy/arkcli-panel.service). It installs to `/opt/arkcli-panel`, runs as the dedicated `arkcli` system account, and listens on `127.0.0.1:3000`.

1. Install Node.js **>= 20.6** and check the node path:

```bash
command -v node    # usually /usr/bin/node
```

2. Create the service account and clone the repo:

```bash
sudo useradd --system --user-group --home /opt/arkcli-panel --shell /usr/sbin/nologin arkcli
sudo mkdir -p /opt/arkcli-panel
sudo chown "$USER" /opt/arkcli-panel
git clone https://github.com/sharamcc/arkcli-panel.git /opt/arkcli-panel
```

3. Build:

```bash
cd /opt/arkcli-panel
npm ci
npm run build
```

4. Prepare account configs and hand `configs` to the service account (the panel writes accounts and the language setting there):

```bash
mkdir -p configs/accounts
cp configs/accounts.example.json configs/accounts/my-account.json
# edit configs/accounts/my-account.json: fill in ak / sk / project
sudo chown -R arkcli:arkcli configs
```

5. Install the unit and start it. If `command -v node` is not `/usr/bin/node` (e.g. nvm), edit `ExecStart` first:

```bash
sudo cp deploy/arkcli-panel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now arkcli-panel
```

6. Verify:

```bash
curl -s http://127.0.0.1:3000/health
journalctl -u arkcli-panel -f
```

Upgrade:

```bash
cd /opt/arkcli-panel
git pull --ff-only
npm ci
npm run build
sudo systemctl restart arkcli-panel
```

For LAN access, change `PANEL_HOST` in the unit to `0.0.0.0` and read the security model above first. If you install somewhere other than `/opt/arkcli-panel`, adjust `WorkingDirectory` and `ReadWritePaths` as well; disable `ProtectHome` when installing under `/home`.

## Account configuration

Path: `configs/accounts/<name>.json`. **The file name must match the `name` field.**

| Field       | Required | Description                                                                                                       |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`      | Yes      | Account identifier; letters, digits and dashes only; also the file name                                           |
| `ak` / `sk` | Yes      | IAM sub-user Access Key / Secret Key                                                                              |
| `project`   | No       | Ark project name, defaults to `name`; **must match the IAM-authorized project**, otherwise you get `AccessDenied` |
| `label`     | No       | Display name in the UI                                                                                            |
| `region`    | No       | Defaults to `ap-southeast-1`                                                                                      |
| `enabled`   | No       | Defaults to `true`; disabled accounts are excluded from usage and endpoint aggregation                            |
| `note`      | No       | Free-form note                                                                                                    |

## HTTP API

| Method | Path                         | Description                                                                      | Source restriction |
| ------ | ---------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| GET    | `/api/accounts`              | Account list (masked AK)                                                         | All                |
| POST   | `/api/accounts`              | Create account                                                                   | Local only         |
| PUT    | `/api/accounts/:name`        | Update account (empty `sk` means unchanged)                                      | Local only         |
| DELETE | `/api/accounts/:name`        | Delete account                                                                   | Local only         |
| GET    | `/api/accounts/:name/verify` | Verify credentials and project permission with `ListEndpoints(PageSize=1)`       | All                |
| GET    | `/api/usage`                 | Multi-account usage summary; params `start`/`end`/`interval`/`account`/`project` | All                |
| GET    | `/api/usage/breakdown`       | Per-account endpoint/model breakdown; params `account`/`start`/`end`             | All                |
| GET    | `/api/endpoints`             | Endpoint list; filters `account`/`status`/`name`                                 | All                |
| GET    | `/api/endpoints/:id`         | Endpoint detail                                                                  | All                |
| GET    | `/api/models`                | Foundation model list (not wired into the UI yet)                                | All                |
| GET    | `/api/settings`              | Current panel language (`zh` / `en`)                                             | All                |
| POST   | `/api/settings/language`     | Update panel language; body `{ "lang": "zh" \| "en" }`                           | Local only         |

All responses share the shape `{ success, data, error? }`.

## Known limitations

- **Query range must be under 31 days** (Ark limit). The UI takes a 31-day window from the selected start date, and the backend validates it again.
- **Usage data has a 5–30 minute delay**. The "updated at" shown in the page is the query time, not the data generation time.
- **`/api/models` is unavailable under project-scoped authorization**: `ListFoundationModels` has no `ProjectName` parameter and is only authorized at `project/*`. It requires account-level read-only permission; the UI does not use it yet.
- **No historical storage**: there is no database; trends query Ark's historical ranges directly.
- **UI language**: Chinese and English, switchable at the bottom of the sidebar; the choice is persisted and also drives backend logs and config warnings.

## Development

```bash
npm run dev     # backend (Fastify, 127.0.0.1:3000)
npm run web     # frontend (Vite, localhost:5173, proxies /api to 3000)
npm run build   # compile the backend and build the frontend into web/dist
npm run typecheck   # backend + frontend type checking
npm run lint        # ESLint
npm run format      # Prettier formatting (format:check only checks)
npm test        # unit tests for aggregation logic (node:test, no extra deps)
```

`npm install` installs a husky pre-commit hook: before committing, `eslint --fix` and `prettier --write` run on **staged files**, and a failure blocks the commit. Skipping the hook (`--no-verify`) is not supported.

## Get an API Key

Direct BytePlus API Keys. Seedance 2.0 mini / fast is on a limited-time discount. Reach out on Telegram [@callxyabc_bot](https://t.me/callxyabc_bot).

Only the `@callxyabc_bot` handle is official; any similar username is an impostor.

## License

[MIT](LICENSE)
