# Plan: Cartograph manifest — 跨 repo 結構化資料層

> **新 repo onboard 讀兩份就夠**：
> - [`manifest-template.md`](./manifest-template.md)：完整欄位 schema + 可複製範例（「寫什麼」）
> - [`manifest-extraction-guide.md`](./manifest-extraction-guide.md)：每個欄位從 repo source code 哪裡挖（「值從哪裡來」）；含 Go / Python / Node / Java 幾套 pattern
>
> 本文件偏重**設計原則、決策紀錄、與 rationale**（「為什麼這樣設計」）。

## 目的

為任意 polyglot microservice 組織建立**統一格式的機器可讀結構化資料**，由 Cartograph aggregator 讀取每個 repo 的 manifest，產出跨 repo 資料流圖與互動式文件入口。

## 目前狀態（已交付能力）

| 能力 | 狀態 | 依據 |
|---|---|---|
| 6 種 entity 的獨立 yaml（API / worker / table / topic / integration / middleware） | ✅ | template §3–§8.5 |
| 單一 repo 的互動式 drill-down（sidebar / list filter / Cmd+K / Mermaid） | ✅ | `docs/ui-architecture.md` |
| 跨 repo API 直連（`steps[].target_api_ref: "<repo>:<api-id>"`，宣告式 + graceful degradation） | ✅ | template §9 |
| 跨 repo Pub/Sub producer / consumer join（以 topic id 對齊） | ✅ | aggregator 建構時自動 join |
| 新架構：manifest 生在 aggregator repo（`$CARTOGRAPH_HOME/data/<repo-id>/`），source repo 唯讀 | ✅ | `cartograph-init` / `cartograph-continue` / `cartograph-update` skills |
| 支援 GitHub 與 local-only 兩種 source repo | ✅ | `service.yaml#repo` 選填；`CodeRef` 有值時 render GitHub link、無則純文字 |

## 視覺化工具支援的功能

1. 顯示所有 API
2. 點 API → 看內部完整邏輯：經過哪些 middleware、呼叫哪些 service / 第三方、送出 / 接收的資料格式
3. 顯示用到的 DB table；點 table → 顯示 schema + 反向索引（誰讀 / 誰寫）
4. 顯示使用到的 worker；點 worker → 顯示內部流程（ack / retry / step timeline）
5. 顯示 Pub/Sub topic、producer / consumer 關係（含跨 repo）
6. 點 middleware → 看 kind / config / reads-writes context / error responses / 用到它的 API 與 pipeline
7. 跨 repo API forward link — 從 caller step timeline 一鍵跳到 callee detail 頁

## 已規劃但尚未做的能力

- 跨 repo 資料流的**視覺化圖**（目前只有宣告式 link，尚未畫 end-to-end flow graph）
- Schema drift 的 build-time 檢查（例：API `uses.tables` 指向的 table yaml 不存在 → warn）
- 新 repo onboard 用範本 scaffold（目前靠 `cartograph-init` skill + 人工）

## 設計原則

1. **單邊宣告**：每個 repo 只宣告「自己這側」做什麼。跨 repo 的 producer ↔ consumer 由 aggregator 透過 topic / API id 對齊自動 join。避免雙邊宣告的 drift。
2. **一個實體一份檔**：API、worker、table、topic、external service 各有各的 YAML，方便 drill-down，改動範圍小。
3. **ID 為 join key**：所有交叉引用（`uses.tables`、`workers_triggered`、`consumed_by` 等）透過 id 字串對齊對應 yaml 的 `id:` 欄位。
4. **不重複 OpenAPI**：API request/response schema 以 `openapi_ref` / `schema_ref` 指向既有 `docs/openapi.yaml` 或 Go struct，不重寫細節。
5. **Mermaid 內嵌為字串**：`sequence_mermaid:` 欄位直接放 Mermaid 原始碼，aggregator 直接 render。
6. **Source repo 零侵入**：所有結構化資料寫進 Cartograph repo 的 `data/<repo-id>/`；source repo 完全唯讀，不需要為了 manifest 在別人家 repo 開 PR。

## 檔案結構

每個 source repo 的 manifest 落在 Cartograph 的 `data/<repo-id>/` 底下。entity 子資料夾 layout 如下（以某個 media-service 為例）：

```
$CARTOGRAPH_HOME/data/<repo-id>/
├── service.yaml                      # 頂層索引 + middleware pipelines + env config + deploy env
├── apis/
│   ├── health.yaml                   # 每個 HTTP endpoint 一份
│   ├── audio-convert.yaml
│   └── get-conversion.yaml
├── workers/
│   └── task-processor.yaml           # 每個 worker / subscription 一份
├── tables/
│   └── conversion.yaml               # 每張 DB table 一份
├── topics/
│   ├── media-tasks.yaml              # 每個 Pub/Sub topic 一份
│   └── media-results.yaml
├── integrations/                     # inbound webhook + outbound 都放這
│   ├── gcs.yaml
│   └── http-source-download.yaml
└── middlewares/                      # 一等 entity（2026-04 加入）
    ├── bearer-auth.yaml
    └── request-logger.yaml
```

`batch_plan/<repo-id>/`（`cartograph-init` 建立）則放 batch plan + session handover，不是 aggregator 的輸入。

## 各類型檔案的 schema 約定

### `service.yaml`（index）

- `id / repo / team / description / tech`
- `components[]`：一個 repo 可能有多個 binary（API + worker）。
  **判斷標準（三個都滿足才算一個 component）**：
  1. 有自己的 entrypoint（Go 就是 `cmd/<name>/main.go`；其他語言等價於獨立啟動 script）
  2. build 成獨立 binary 或獨立 image tag — 即使多個 component 共用同一個 Docker image，
     也要用不同 `command` / `ENTRYPOINT` 分進不同 process
  3. 部署成獨立的 runtime 實體（對應到 infra 層的不同 Cloud Run service / worker pool / job / K8s deployment 等）

  **反例**（不算 component）：同一 binary 內的 package/module、同 process 內的 goroutine、
  K8s sidecar container。

  **Join key**：每個 `apis/<id>.yaml` / `workers/<id>.yaml` 都要寫 `component: <id>`，指回這個 list 裡的某個 component id。
  aggregator 可以用此反查「哪些 endpoint 由哪個 binary 承載」，後續也方便畫 runtime 拓撲圖。

  以 repo-b 為例：`cmd/api`（Cloud Run service）與 `cmd/worker`（Cloud Run worker pool）是兩個 component，
  具體差別見 `docs/infra.md` §3.1 vs §3.2。
- `apis[] / workers[] / tables[] / topics_produced[] / topics_consumed[] / external_services[]`：
  僅列 id + file，細節去各自檔案查
- `middleware_pipelines[]`：共用的 middleware order，API 檔案透過 `middleware_pipeline: <id>` 引用
- `env_config[]`：環境變數總覽 + 誰使用
- `environments[]`：每個部署環境的實體資訊（GCP project / region / API URL pattern / GCS bucket / CDN prefix）。
  來源為 `docs/infra.md`。用明確列表而非單一 `{env}` pattern，避免 jp-production 這類命名不對稱的環境被 mask 掉。
  aggregator 以此為 ground truth，後續 drift check 也從此出發。

### `apis/<id>.yaml`

- `id / method / path / component / description / auth`
- `code_ref / openapi_ref`：指向實作
- `middleware_pipeline + middlewares[]`：按順序列出，含 `code_ref` 和 `config_env`
- `request`：content_type、fields（含 enum、validation 規則），或 `schema_ref`
- `response[]`：各種 status code 對應的 schema 或 error_code
- `steps[]`：handler 內部步驟，每個 step 有 order / action / target / code_ref
- `uses`：去重摘要 —— `tables / topics_produced / topics_consumed / external_services / workers_triggered`
- `sequence_mermaid`：整條流程的 Mermaid sequence diagram（字串）

### `workers/<id>.yaml`

- `id / component / description / binary / code_ref`
- `subscribes_topic + subscription_pattern + subscription_env`
- `processors[]`：dispatch 用；含 `status: not_implemented` 標記未實作的預留類型
- `receive_settings`：max_outstanding_messages、max_extension 等
- `idempotency`：策略 + rule + code_ref
- `ack_semantics`：ack_on / nack_on（這對理解 retry 行為至關重要）
- `steps[]`：同 API
- `failure_handling`：失敗時的動作序列
- `uses` / `sequence_mermaid`

### `tables/<id>.yaml`

- `id / database / description`
- `migration_ref / model_code_ref / repo_code_ref`
- `columns[]`：name、type、nullable、default、enum、description
- `indexes[]`：name、columns、unique、type
- `read_by / write_by`：反向索引，分成 `apis[]` 和 `workers[]`

### `topics/<id>.yaml`

- `id / provider / gcp_project_pattern / description`
- `schema_ref / publisher_code_ref / consumer_code_ref`
- `message_schema`：fields（name / type / enum / nullable）
- `attributes[]`：Pub/Sub message attributes
- `produced_by[] / consumed_by[]`：本 repo 內的 producer/consumer
- `known_external_consumers[]`（optional hint）：跨 repo 的已知消費者，供 aggregator 核對
- `retry_policy / delivery_guarantee`

### `integrations/<id>.yaml`

（原名 `external_services/`；一併涵蓋 inbound webhook 接收者與 outbound 呼叫者，避免大型 repo 的 messaging platform integration 被拆成兩個地方宣告。）

- `id / kind / provider / description / code_ref`
- `directions: [inbound] / [outbound] / [inbound, outbound]` — 靠欄位表達方向，不分資料夾
- `inbound` 區塊（選填）：
  - `webhook_endpoints[]`：指回 `apis/*.yaml` 裡 `endpoint_type: webhook` 的 id
  - `auth / signature_header / verification_env`
- `outbound` 區塊（選填）：
  - `operations[]`：每個出境呼叫的 method / url / code_ref
  - `auth_env / rate_limits`
- kind-specific 欄位（沿用舊格式）：
  - `cloud-storage`：bucket_pattern、paths[]、external_writers[]
  - `cli-tool`：operations[]、binary_required[]、docker notes
  - `outbound-http`：protocol、url pattern、security
- `used_by`：哪些 API / worker 使用

**判斷在 `integrations/` 還是 `apis/`**：receiver（能從外部 push 進來的 HTTP endpoint）本身是 `apis/<id>.yaml` 加 `endpoint_type: webhook`；`integrations/<platform>.yaml` 的 `inbound.webhook_endpoints` 把同一平台的多個 webhook endpoint 串起來做整合級總覽。

### API 版本化（跨 repo 共通約定）

- **檔名**：`apis/<id>.v<n>.yaml`（e.g. `send-message.v2.yaml`）
- **Composite key**：`(id, version)`。單版本可省略 `version` 欄位
- **狀態標記**：`status: active / deprecated / sunset`，搭配 `deprecated_in` 與 `replaced_by`
- **aggregator UI**：list page 一張卡顯示 logical API + 各 version tab；detail page 可 dropdown 切版本
- **rationale**：避免把 version 塞進 id 字串變成 `send-message-v2`，讓「送訊息這個 API」永遠是同一個 logical 實體，只是 version 不同

## 視覺化工具的資料消費路徑

| UI 動作 | 讀什麼 |
|---|---|
| 首頁列表 | `service.yaml` → 左欄分類列 APIs / Workers / Tables / Topics |
| 點 API | `apis/<id>.yaml` → middleware pipeline + steps timeline + 右側 panel 顯示 `uses`（tables / topics / externals / workers 可再點） |
| 點 table | `tables/<id>.yaml` → schema table + `read_by` / `write_by` 反向列 |
| 點 topic | `topics/<id>.yaml` → schema + `produced_by` / `consumed_by`（跨 repo 由 aggregator 補齊） |
| 點 worker | `workers/<id>.yaml` → subscription 設定 + steps + ack semantics + mermaid |
| 跨 repo producer / consumer 連線 | Aggregator 合併所有 repo 的 `topics/*.yaml`，以 topic id 對齊；reverse index 自動推出（宣告端不需寫 consumer 列表） |
| 跨 repo API 跳轉 | caller step 寫 `target_api_ref: "<repo-b>:<api-id>"`；aggregator 解析後 render 成 clickable link（目標尚未 index 時降級為 pending badge）|

## 建立流程

建議走 `cartograph-init` / `cartograph-continue` / `cartograph-update` 三支 skill 完成全部流程：

1. `cartograph-init --source <path>` → 讀範本 + 掃 source repo → 產 `batch_plan/<repo-id>/batch_plan.md`
2. 多次 `cartograph-continue --repo <repo-id>` → 按 batch 寫 `data/<repo-id>/*.yaml`；每批自動檢查 YAML、更新 service.yaml；context 過半會提示 handover
3. 後續 source repo 有新 commit 時 `cartograph-update --repo <repo-id>` → 增量同步

手動操作時的建議順序（skill 內部也照此）：tables → topics → integrations → middlewares → workers → apis → sequence_mermaid。依賴由淺入深，避免寫到後面才發現前面 id 缺 yaml。

## 維護規則

| 觸發 | 要改什麼 |
|---|---|
| 新增 HTTP route | `apis/<new>.yaml` + `service.yaml#apis` |
| 新增 middleware | `middlewares/<id>.yaml`（kind / description / code_ref / config / reads_context / writes_context / error_responses / order_constraints / notes）+ `service.yaml#middlewares` + `service.yaml#middleware_pipelines` 的 `order[]` + 相關 `apis/*.yaml#middlewares[]` 加一行 id |
| 新增 pubsub publish / subscribe | `topics/<id>.yaml` + 呼叫端 `uses` 區塊 |
| DB migration | `tables/<id>.yaml`（欄位、索引、reverse index） |
| 新增第三方串接（outbound） | `integrations/<id>.yaml` + 呼叫端 `uses.integrations` |
| 新增 webhook receiver（inbound） | `apis/<id>.yaml`（`endpoint_type: webhook`）+ `integrations/<platform>.yaml#inbound.webhook_endpoints` |
| API 升版 | 新增 `apis/<id>.v<n>.yaml`；舊版改 `status: deprecated`、`replaced_by: v<n>` |
| 改 env 變數 | `service.yaml#env_config` + 使用者的 `config_env` 欄位 |
| 新增 / 改部署環境（新 GCP project、bucket 名稱、region） | `service.yaml#environments` + `docs/infra.md` 第 2 節 |

**暫不做**：CI drift check、完全自動 extraction。目前靠 `cartograph-update` + code review 配合；等資料結構更穩定後再評估是否加 build-time lint。

## 與 aggregator 的接口

- Aggregator 讀取路徑：`$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` 為入口，沿著 `file:` 欄位遞迴載入。
- 跨 repo join key：
  - **Topic**：`topics/<id>.yaml#id` 全 org 唯一字串（topic 名稱）
  - **API**：`apis/<id>.yaml#id` 僅 repo 內唯一；跨 repo 引用用 composite `<repo>:<api-id>`
- Consistency check（規劃中）：compare `topics/*.yaml#produced_by` 與其他 repo 的 `consumed_by`、檢查 `uses.*` 所有 id 是否都有對應 yaml，不對齊 warn。

## 已知限制 / 待討論

1. **Logical contract ID**（尚未引入）：目前 topic / API 用 runtime 名稱做 join key，若未來 rename 或加 version 會斷。需討論是否導入 `<org>.<repo>.<entity>.v1` 這類穩定 ID。
2. **Framework-provided middleware 的 code_ref**：例如 gin 內建 `gin.Recovery()` 無法指到本 repo 的 code — 目前用 `provided_by: gin-framework` 欄位表達，但若未來要支援跨語言 framework，需更一般化的表示方式。
3. **OpenAPI 路徑編碼**：`openapi_ref` 用 `#/paths/~1api~1v1~1foo/post` 這種 JSON Pointer encoding，aggregator 要會解析。
4. **Source repo 本地路徑與 yaml 產出的耦合**：`cartograph-update` 需要 source 路徑以跑 `git log`；目前靠 batch_plan header 記住，但若 source 路徑變動要 `--source` 重新指定。
5. **data/<repo-id>/ 是否 commit**：目前未決定。若當個人工具 → `.gitignore`；若部署成 team 共享站 → commit 進 Cartograph repo。

## 下一步

- [ ] 決定 Cartograph 的 `data/<repo-id>/` 是否 commit（team-shared 與 single-user 走不同路徑）
- [ ] 加 build-time consistency check（dangling id / missing yaml / stale code_ref）
- [ ] 跨 repo flow graph 的視覺化 POC（目前只有 link，缺 end-to-end graph）

---

## 附錄：Schema 演進的典型情境

以下是在真實多 repo 環境推進本範本時，schema 被迫擴充的代表性情境。可用來 sanity-check 自己的 repo 是否需要引入這些選填欄位。

**情境 A：部署模型多樣（Cloud Run + GKE 混用）**
- Cloud Run 用 `*.a.run.app` URL pattern，GKE 用固定網域；Pub/Sub project 可能與部署 project 不同
- 衍生欄位：`environments[].deployment_type` / `shared_resource_project` / `api_url` / `helm_values_ref` / `argocd_app_ref` / `terraform_ref`

**情境 B：Auth 不只在 middleware，也在 handler / service 層**
- 部分驗證函式（例：檢查 resource 是否在 credential scope 內）是 handler body 或 service 方法，不是 middleware
- 衍生欄位：`apis[].inline_auth_checks[]`

**情境 C：Handler 內部 inline 定義 Response struct**
- Go / Python handler 常在 function 內定義 `type Response struct`，非 payload package 頂層
- 衍生欄位：`schema_ref` 格式支援 `<file>#<OuterFunc>.<InnerType>`

**情境 D：事件外送不只 Pub/Sub，還有 structured-log sink**
- 部分服務用 cloud-logging-sink 做事件路由（structured log + GCP sink → BigQuery 這類模式），不是 Pub/Sub
- 衍生欄位：`uses.log_sinks_produced[]` + `integrations/<id>.yaml kind: cloud-logging-sink`

**情境 E：外部呼叫失敗語義不只「成功或錯」**
- 同為外呼，有的失敗必中斷（DB / CDP 同步）、有的失敗 log 繼續（metric / engagement event）、有的 fire-and-forget
- 衍生欄位：`steps[].failure_semantic` + `outbound.operations[].failure_semantic`（block / best_effort / log_only）

**情境 F：同 middleware id 在 chain 裡重複出現**
- 這通常是刻意設計（例：outer + inner recovery 讓 panic 後 access log 仍能寫入）。
- 結論：不在 schema 層做 workaround；manifest 的 `middlewares[]` 只記一次 logical chain。

**Rationale 原則**（從以上情境萃取）：
- **單邊宣告不變**——每個 repo 只記自己這側的事實
- **新欄位一律先在個別 repo pilot、穩定再更新範本**（§13 Schema 演進約定）
- **避免為個案 bloat 範本**——優先用選填、且能從 code 自動推得的欄位
