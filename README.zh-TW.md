# Cartograph

> [English](./README.md) · **繁體中文**

為 polyglot 微服務組織打造的 **service catalog / architecture atlas**。把它接上一批 repo（local clone 或 GitHub）就能得到一個互動式 drill-down 網站，覆蓋每個 repo 的 API、worker、table、topic、integration、middleware，跨 repo 連結自動解析。

概念上類似 **Backstage / Cortex / OpsLevel**，但：單一靜態網站、無後端、無資料庫、無 CRD。所有 manifest YAML **由這個 Cartograph repo 自己擁有**（放在 `data/<repo-id>/`），source repo 完全不動。

## 架構一覽

```
$CARTOGRAPH_HOME/
├── data/<repo-id>/         ← manifest 放這裡（每個 source repo 一個資料夾）
│   ├── service.yaml
│   ├── apis/ workers/ tables/ topics/ integrations/ middlewares/
├── batch_plan/<repo-id>/   ← init + continue skill 寫 plan + handover 的地方
├── docs/
│   ├── manifest-template.md        ← schema 規格（每個欄位寫什麼）
│   ├── manifest-extraction-guide.md ← 每個欄位從 source code 哪裡挖
│   └── manifest-plan.md            ← 設計 rationale
├── .claude/skills/         ← 寫 manifest 用的 Claude Code skills
│   ├── cartograph-init/
│   ├── cartograph-continue/
│   └── cartograph-update/
└── src/                    ← Next.js aggregator（讀 data/ → render 網站）

<anywhere>/<source-repo>/   ← clone 下來的 source repo（read-only；永不修改）
```

## 技術棧

- Next.js 14 (App Router) + TypeScript + Tailwind
- `yaml` parsing、`zod` runtime validation + type inference
- `mermaid` for sequence diagram
- `lucide-react` for icon

無後端。Build 產物是 static SSG — 可部署到任何靜態 hosting（Cloudflare Pages / Vercel / GitHub Pages / S3）。

## Quick start

```bash
# 1. 安裝依賴
make install                 # 或：npm install

# 2. 啟動 dev server（預設 port 3000；可用 PORT=... 覆寫）
make dev                     # http://localhost:3000
make dev PORT=3010           # http://localhost:3010

# 其他 dev 指令
make dev-attach              # attach 進 tmux session
make dev-logs                # 看 dev server 最新 40 行 log
make dev-stop                # 停 tmux session

# 3. Production
make build                   # 預渲染所有頁面
make start PORT=8080         # 指定 port 跑 prod build
make typecheck               # tsc --noEmit
make lint                    # next lint
```

跑起來後，打開 `make dev` 印出的 URL。你會看到專案內建的兩個 fictional demo repo，UI 可以直接操作 — 詳見下節。

## Demo 資料（內建於 repo）

`data/demo-A/` 與 `data/demo-B/` 是**虛構的測試 fixture**，目的是讓你不需架設真正的 source repo 就能探索 UI：

- **`demo-A`** — 假想的 URL shortener 服務（`example-org/demo-A` on「GitHub」，所以 `code_ref` 會 render 成 clickable GitHub link — 實際會 404 因為 org 是假的，但 render 行為是真的）
- **`demo-B`** — 假想的圖片處理服務（沒設 `repo:` 欄位 → local-only 模式，`code_ref` render 為純文字）
- **跨 repo 連結** — `demo-A/apis/create-link` 的 step 5 透過 `target_api_ref` 呼叫 `demo-B/apis/create-thumbnail`；打開那一步可以看到 live 跨 repo 連結

Demo 涵蓋的範圍：每個 repo 4 支 API 分兩個 group、worker、table、topic、integration（inbound webhook + outbound HTTP）、middleware、Pub/Sub producer/consumer join、跨 repo forward link。

**正式使用 Cartograph 時**請刪掉兩個 demo 資料夾：

```bash
rm -rf data/demo-A data/demo-B
```

你自己透過 `cartograph-init` / `cartograph-continue` 產出的 `data/<repo-id>/` 會跟著 git 一起管 — 就跟其他檔案一樣正常 commit。

## 使用方式（加入新的 source repo）

Cartograph 在 `.claude/skills/` 底下附了三支 Claude Code skill 負責 manifest 的建立與維護。**你不需要手寫 YAML**。

### 0. 前置條件

- Source repo 必須**先 clone 到本機**。Cartograph **不會**代你 clone。
- 如果是 GitHub repo，clone 完後 skill 會自動偵測 `git remote get-url origin`，把 `code_ref` 串成 clickable GitHub link。
- Local-only repo（沒 remote、或非 GitHub remote）也支援 — `code_ref` 只會 render 成純文字，不可點。

### 1. 建立 batch plan — `/cartograph-init`

```
/cartograph-init --source /absolute/path/to/source-repo
```

這支 skill 會：

1. 讀 `docs/` 下三份標準文件（template / extraction-guide / plan）
2. 偵測 source 是 GitHub / other-remote / local-only
3. 掃 source 統計 API、worker、table、topic、integration、middleware、pipeline 的數量
4. 產 `batch_plan/<repo-id>/batch_plan.md`，內含：
   - source 路徑 + 模式（後續 skill 不用重新偵測）
   - 每類 entity 的數量
   - 每批約 15–35 支 API 的 checklist
   - schema 規則 cheatsheet

這一步**不**產任何 YAML — 先 review plan 再繼續。

### 2. 執行 plan — `/cartograph-continue`

```
/cartograph-continue --repo <repo-id>
```

可以跑多次。每次呼叫會：

1. 讀標準文件 + `batch_plan/<repo-id>/batch_plan.md` + `handover.md`（若存在）
2. 挑第一個未勾選的 batch
3. 直接把 YAML 寫到 `data/<repo-id>/...`、更新 `service.yaml`、做驗證
4. 勾 batch + 附加一筆 handover 紀錄
5. 自己監控 context 用量 — 超過 ~50% 會寫 handover 並要求你開新 session 再跑下一批

跑的過程可以開 Cartograph 瀏覽器看 entity 即時出現。

### 3. 持續同步 — `/cartograph-update`

```
/cartograph-update --repo <repo-id>                     # 增量
/cartograph-update --repo <repo-id> --api <api-id>      # 只更這一支 API
/cartograph-update --repo <repo-id> --scope 'internal/router/handler_chat_*.go'
```

這支 skill 會:

1. 讀標準文件
2. 從 `data/<repo-id>/.cartograph-last-source-head`（上次 update 寫的）或 init 時記錄的 source HEAD 決定 baseline commit
3. 在 source repo 跑 `git log <base>..HEAD --name-only` + 看未 commit 的 source 改動
4. 分類改動檔案 → 對應到特定 YAML id → patch drift 掉的欄位（`code_ref` / `steps[]` / `uses.*` / columns 等）
5. 保留手寫的 `description` / `notes` / `sequence_mermaid`，不覆蓋
6. 更新 baseline marker

每次 source checkout `git pull` 完跑一次很適合。

## UI 呈現的內容

- **左側 sidebar**（每個 repo 一份）— APIs / Middlewares / Workers / Tables / Topics / Integrations；API 與 Table 依 path / id prefix 自動分群；可折
- **列表頁** — URL-driven filter + 分群（`?method=POST&q=audio`）；chip 選項由資料推出；bookmark 可分享
- **Detail 頁** — sequence diagram（mermaid）、middleware pipeline 的 clickable chip、step timeline 含跨 repo 連結、反向索引（哪些 API 讀這張 table、哪些 worker 訂閱這個 topic、哪些 pipeline / API 用這支 middleware...）
- **Cmd+K palette** — 跨 repo fuzzy search 所有 entity
- **跨 repo API 連結** — caller 的 API step 寫 `target_api_ref: "<repo>:<api-id>"`；aggregator render 時如果目標已 index 就 render 成 live link，否則顯示 "pending" badge（graceful degradation — 不需要兩 repo 同步 rollout）
- **`code_ref` render 規則** — 若 `service.yaml#repo` 有值（GitHub 模式），每個 `code_ref` 會變成 `https://github.com/<org>/<repo>/blob/main/<path>`；否則是純文字

UI 的設計決策與擴充方式見 [`docs/ui-architecture.md`](docs/ui-architecture.md)。

## 路由

- `/` — repo 列表
- `/repos/<repo>` — repo 總覽（tech / components / env / deployments / counts）
- `/repos/<repo>/{apis,workers,tables,topics,integrations,middlewares}` — list page
- `/repos/<repo>/{kind}/<id>` — entity detail

## 資料夾對應

```
data/                              # manifest snapshot（每個 source repo 一個資料夾）
batch_plan/                        # 每個 source repo 一個資料夾 — plan + handover
.claude/skills/
  cartograph-init/SKILL.md
  cartograph-continue/SKILL.md
  cartograph-update/SKILL.md
src/
  types/manifest.ts                # Zod schema + inferred TS type（規格的單一來源）
  lib/loader.ts                    # 讀 YAML → 驗 schema → 回傳 typed Repo[]
  lib/resolver.ts                  # 反向索引 / producer-consumer lookup
  lib/paths.ts                     # URL builder
  lib/sidebar.ts                   # sidebar tree + 自動分群規則
  lib/searchIndex.ts               # Cmd+K palette 索引
  lib/crossRepo.ts                 # target_api_ref 解析器
  app/                             # App Router 頁面
  components/                      # Breadcrumb, EntityCard, MiddlewarePipeline,
                                   #   StepsTimeline, MermaidDiagram, SchemaTable,
                                   #   UsesPanel, CodeRef, CommandPalette, RepoSidebar
docs/
  manifest-template.md             # schema 規格 — canonical
  manifest-extraction-guide.md     # 每個欄位從 source code 哪裡挖
  manifest-plan.md                 # 設計 rationale
  plan.md                          # 專案 rationale
  ui-architecture.md               # UI 三層導覽架構 + 擴充指南
```

## 擴充 schema

Schema 不夠用 → 依下列流程擴充：

1. 在 `src/types/manifest.ts` 加新欄位為 `.optional()`（向後相容）
2. 在 `docs/manifest-template.md` 增補說明（若欄位需對應 source code，也更新 `manifest-extraction-guide.md`）
3. 先在一個 repo 試點；穩定後若影響 skill 行為，更 SKILL.md

上述全部可以在同一個 PR — Zod 契約、docs、skill 指令同步更新。

## 授權

MIT.
