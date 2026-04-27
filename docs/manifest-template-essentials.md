# Manifest Template — Essentials

> **Single skill-facing spec**。`cartograph-init` / `cartograph-continue` / `cartograph-update` / `manifest-validate` 都讀這份，覆蓋寫 yaml 所需的全部規則。
>
> 完整 rationale、演進史、pilot 紀錄留在 `manifest-template.md`（人類查閱用、不在 skill flow 上、已凍結維護）。`manifest-extraction-guide.md` 是「值從 source code 哪裡挖」的搭檔。

---

## 0. 寫前必知

### Folder layout

```
$CARTOGRAPH_HOME/data/<repo-id>/
├── service.yaml                 # 頂層索引 + middleware_pipelines + env_config + environments
├── apis/<id>[.v<n>].yaml        # 每支 HTTP endpoint (含 webhook)
├── workers/<id>.yaml            # 每個 pubsub subscriber / scheduler / cron
├── tables/<id>.yaml             # 每張 DB table
├── topics/<id>.yaml             # 每個 Pub/Sub topic
├── integrations/<id>.yaml       # 每個第三方整合 (inbound / outbound / 雙向)
└── middlewares/<id>.yaml        # 一等 entity (HTTP middleware)
```

Source repo 唯讀；所有 yaml 寫進 Cartograph 的 `data/<repo-id>/`。

### 建檔順序（依賴由淺入深）

```
tables → topics → integrations → middlewares → workers → apis → sequence_mermaid
```

後者 `uses.*` 引用前者的 id；倒過來寫會在 zod build 時 dangling。

### Index sync 規則

寫 / 改 / 刪任何 entity yaml，**必須同步** `service.yaml` 對應 list 的 `{ id, file }` 一行。aggregator 從 `service.yaml` 為入口遞迴載入；index 沒加 = 該 yaml 不會被讀到。

### 核心原則（4 條）

1. **單邊宣告**：每個 repo 只寫自己這側做什麼；跨 repo 關係由 aggregator 用 id 對齊自動 join。
2. **一個實體一份檔**：方便 drill-down、change review、選擇性更新。
3. **id 為 join key**：所有 `uses.*` 透過 id 字串對齊對應 yaml 的 `id:` 欄位。
4. **schema 不抄**：API request/response 用 `schema_ref` / `openapi_ref` 指向既有 source code，不重寫。

---

## 1. service.yaml — skeleton

```yaml
id: <service-id>                    # 全 org 唯一；通常 = repo 短名
repo: <org>/<repo>                  # github 模式才填；local-only / non-github 省略
team: <owning-team>
description: <一行>
tech: [go, postgres, gcp-pubsub]    # free-form 技術標籤

components:                         # 一個 repo 可能多個 binary
  - id: api
    binary: cmd/api                 # Go: cmd/<name>；Python: "uvicorn app.main:app" 之類啟動命令
    description: HTTP server
  - id: worker
    binary: cmd/worker
    description: Pub/Sub subscriber

# 各 entity index — 只列 id + file，細節在各自 yaml
apis:           [{ id, file }]
workers:        [{ id, file }]
tables:         [{ id, file }]
topics_produced: [{ id, file }]
topics_consumed: [{ id, file }]
integrations:   [{ id, file }]
middlewares:    [{ id, file }]

depends_on_infra: [postgres, gcp-pubsub, gcs, secret-manager]

middleware_pipelines:               # 共用 middleware order — 只組合 id chain，不重定義內容
  - id: <pipeline-id>
    description: ...
    order: [<mw-id>, <mw-id>, ...]

env_config:
  - { key: APP_X, used_by: [<consumer-id>], source: secret-manager, default: ... }

environments:                       # 部署實體；明確列每個 env，不用 {env} pattern (jp-production 對不上)
  - id: staging
    gcp_project: <project>
    region: <region>
    deployment_type: cloud-run | gke-helm | gke-raw | k8s-deployment
    # cloud-run:  api_url_pattern (含 *.a.run.app wildcard) + gcs_bucket + cdn_url_prefix
    # gke-*:      api_url (固定網域) + helm_values_ref + argocd_app_ref + terraform_ref
    #             + shared_resource_project (Pub/Sub 不在部署 project 時)
    #             + db_instance / redis_instance / cdn_domain / image_repo
```

### Components 判斷標準（三個都滿足才算）

1. 有自己的 entrypoint（`cmd/<name>/main.go` 或啟動 script）
2. build 成獨立 binary 或獨立 image tag（共用 image 但不同 `command` 也算）
3. 部署成獨立 runtime（Cloud Run service / worker pool / K8s deployment）

反例（**不算** component）：同 binary 內 package、同 process goroutine、sidecar container。

### Environments 命名

- `*_pattern` 用於含 wildcard 的值（`api_url_pattern: "https://x-staging-*.a.run.app"`）
- 固定值不帶 `_pattern`（`api_url: "https://api.staging.your-org.com"`）

---

## 2. `apis/<id>.yaml` — skeleton

```yaml
id: <unique-within-repo>
version: v1                         # 多版本才填；單版本省略
status: active                      # active | deprecated | sunset
deprecated_in: "2026-12-01"         # 搭 status=deprecated
replaced_by: v2
endpoint_type: rest                 # rest (default) | webhook | internal
group: <override>                   # 通常自動推 (見下)；override 才寫

method: POST
path: /api/v1/...
component: api                      # join to service.yaml#components[].id
description: <1-3 句；功能摘要不是 step 流程；見 §11 description 規則>
auth: none | bearer_token | api_key | webhook-signature | ...
code_ref: <path>#<Symbol>
openapi_ref: docs/openapi.yaml#/paths/...    # 選填

middleware_pipeline: <pipeline-id>
middlewares:
  - id: <middleware-id>             # 只列 id；詳細在 middlewares/<id>.yaml

inline_auth_checks:                 # 選填；handler/service inline 驗證 (非 middleware)
  - { name, code_ref, scope, note }

request:
  content_type: application/json
  schema_ref: <path>#<Symbol>
  path_params: [{ name, type, required }]
  headers_optional: [{ name, max_length }]
  fields: [{ name, type, required, validation, enum }]

response:
  - status: 201
    schema_ref: <path>#<Symbol>
    fields: [{ name, type, nullable, enum, description }]   # 對稱 request.fields[]
  - status: 400
    error_code: PARAMETER_INVALID
    note: ...

steps: [...]                        # 見 §8；可為空 []

uses:
  tables: [...]
  topics_produced: [...]
  topics_consumed: [...]
  integrations: [...]
  workers_triggered: [...]
  log_sinks_produced: [...]         # 非 Pub/Sub 的事件外送 (Cloud Logging sink)

sequence_mermaid: |                 # required；見 §9
  ...
```

### 版本化

- 檔名：`<id>.v<n>.yaml`（e.g. `send-message.v2.yaml`）
- composite key = `(id, version)`；單版本省 `version` 欄位
- 多版本並存時**所有版本都必填** `version`（缺 = 被視為最舊版，跟其他明列版本混在一起會錯）
- deprecated 時填 `deprecated_in` (date) + `replaced_by` (新版 id)

### Webhook 特化

```yaml
endpoint_type: webhook
auth: webhook-signature
signature_header: <Provider-Signature-Header>     # 選填
verification_token_env: <PROVIDER>_VERIFY_TOKEN   # 選填；驗 URL 時用
```

Webhook 寫在 `apis/`，不在 `integrations/`。同 provider 的 inbound + outbound 在 `integrations/<provider>.yaml#inbound.webhook_endpoints` 串起來。

### group 自動推算

aggregator 從 `path` 自動推（**大部分情境不要手寫** `group:`）：

| path | 自動 group |
|---|---|
| `/api/vN/<A>/...` | `A` |
| `/api/vN/<A>/:param/<B>/...` (二層；多租戶常見) | `A/B` |
| `/webhook/<provider>` | `webhook` |
| 其他 | path 第一段 |

自動結果語意錯時才 override `group:`。

---

## 3. `workers/<id>.yaml` — skeleton

```yaml
id: <unique-within-repo>
kind: pubsub-subscriber             # pubsub-subscriber (default) | scheduler | cron | cloud-tasks-worker
component: worker
description: <1-3 句>
binary: cmd/worker
code_ref: <path>#<Symbol>

# kind=pubsub-subscriber:
subscribes_topic: <topic-id>
subscription_pattern: "{env}-..."
subscription_env: APP_PUBSUB_SUBSCRIPTION
receive_settings: { max_outstanding_messages, max_extension }

# kind=scheduler / cron:
schedule: "0 */15 * * *"
trigger: cloud-scheduler | k8s-cronjob | gcp-workflow

# 通用:
processors:                         # dispatch 用
  - { id, conversion_type?, code_ref?, status? }    # status: not_implemented 預留未實作 case
idempotency: { strategy, rule, code_ref }
ack_semantics: { ack_on: [...], nack_on: [...] }
steps: [...]                        # 見 §8
failure_handling:                   # 自由結構；建議動作序列
  on_processor_error: [...]
uses: { tables, topics_produced, topics_consumed, integrations }
sequence_mermaid: |                 # required；與 API 同規則
  ...
```

---

## 4. `tables/<id>.yaml` — skeleton

```yaml
id: <db-table-name>
database: postgres | mysql | clickhouse | ...
description: <一行；商業意義>
migration_ref: migrations/<id>.up.sql
model_code_ref: <path>#<Struct/Class>
repo_code_ref: <path>               # repository pattern 的實作位置
group: <override>                   # 通常從 id 底線前綴自動推 (user_profile → user)

columns:
  - name: <col>
    type: BIGSERIAL                 # DB 字面 (大寫，含長度)
    primary_key: true
    nullable: false
    default: "NOW()"                # 字串原樣含引號
    enum: [...]                     # CHECK constraint 或應用層約束
    description: ...

indexes:
  - { name, columns: [...], unique, type: primary_key | btree | gin | unique }
```

`read_by` / `write_by` 由 aggregator 從各 entity 的 `uses.tables` 反推，**不要手寫**。

---

## 5. `topics/<id>.yaml` — skeleton

```yaml
id: <topic-name>                    # 全 org 唯一
provider: gcp-pubsub | kafka | nats
gcp_project_pattern: <project>      # hint；真相在 service.yaml#environments
description: <一行>
schema_ref: <path>#<Struct/Class>
publisher_code_ref: <path>#<Symbol>
consumer_code_ref: <path>#<Symbol>

message_schema:
  fields: [{ name, type, required, nullable, enum, description }]

attributes:                         # Pub/Sub message attributes (不屬 message body)
  - { name, type, description }

produced_by: [{ api: <api-id> }, { worker: <worker-id> }]      # 本 repo 內
consumed_by: [{ worker: <worker-id>, subscription: "{env}-..." }]
known_external_consumers: [{ repo, note }]                     # 跨 repo hint

retry_policy: { ... }
delivery_guarantee: at-least-once | at-most-once | exactly-once
```

共用 topic 多 event type 時：所有變體必須在 `attributes[]`（常見 `type` attribute）或 `message_schema.fields[].enum` 列出。

---

## 6. `integrations/<id>.yaml` — kind 分塊

### 通用基本欄位

```yaml
id: <platform-shortname>
kind: <kind>                        # 見下五種
provider: <vendor>                  # 選填
description: <一行>
directions: [outbound] | [inbound] | [inbound, outbound]
code_ref: <path>                    # adapter 入口
local_impl: <path>                  # 本機模擬實作 (選填)
local_impl_note: ...
notes: [...]
used_by: { apis: [...], workers: [...] }
```

### kind: cloud-storage

```yaml
bucket_pattern: "<repo>-{env}"
bucket_env: APP_GCS_BUCKET
paths:
  - { path, direction: read|write, note, used_by: { workers, apis } }
external_writers: [{ id, writes_path, note }]
auth: gcp-service-account
```

### kind: cli-tool

```yaml
invocation: shell-exec | lib-call | go-build
binary_required: [ffmpeg, ffprobe]
operations: [{ id, code_ref, description }]
```

### kind: outbound-http

```yaml
protocol: http | https | grpc
method: GET                         # 若固定
url: "https://api.../{var}"         # 可用 {var} 模板
operations: [{ id, method, url, code_ref, description, failure_semantic }]
auth: bearer-token | oauth2 | ...
auth_env: <PROVIDER>_TOKEN
rate_limits: { note: ... }
security: { scheme_whitelist: [...], validation_code_ref, note }
```

### kind: messaging-platform / payment-platform / ads-platform（雙向）

```yaml
directions: [inbound, outbound]
inbound:
  webhook_endpoints: [<api-id>, ...]      # 對應 apis/<id>.yaml endpoint_type: webhook
  auth: <vendor>-signature
  signature_header: <Header>
  verification_env: <ENV>
outbound:
  operations: [{ id, method, url, code_ref, description, failure_semantic }]
  auth: bearer-token
  auth_env: <ENV>
  rate_limits: { note: ... }
```

### kind: cloud-logging-sink

非 Pub/Sub 的事件外送（zerolog 寫 `cloud_logging_sink: <name>` 欄位由 GCP sink 路由到 BigQuery 等）。

```yaml
directions: [outbound]
sink_name_pattern: "{env}_<service>_{event_name}"
events: [{ id, schema_ref }]
```

使用端在 `uses.log_sinks_produced` 引用 id（**不要**塞進 `topics_produced`）。

### outbound.operations[].failure_semantic 判斷

| caller 程式碼 | failure_semantic |
|---|---|
| `if err := X(); err != nil { return err }` | `block` (預設) |
| `if err := X(); err != nil { logger.Error()... /* 不 return */ }` | `best_effort` |
| `go X()` / 不檢查 err | `log_only` |

同 operation 不同 caller 語義不同 → 拆兩個 id（e.g. `send_event_sync` vs `send_event_async`）。

---

## 7. `middlewares/<id>.yaml` — skeleton

```yaml
id: <unique-within-repo>            # 與 service.yaml#middleware_pipelines[].order[] 對齊
kind: auth | observability | input-validation | rate-limit
       | error-handling | panic-recovery | request-id | other
description: <一行>
code_ref: <path>#<Symbol>
provided_by: <framework>            # 框架內建 middleware 用 (e.g. gin-framework)；自寫的不填
config:
  env_vars: [APP_X]
  secret_source: secret-manager
  note: ...
reads_context: [{ key, type, description }]   # 從 per-request 狀態讀
writes_context: [{ key, type, description }]  # 塞進 per-request 狀態 (下游讀)
error_responses: [{ status, error_code, when }]
order_constraints: [{ must_be_after / must_be_before, reason }]
notes: [...]
```

`apis/<id>.yaml#middlewares[]` 只列 `{ id }`；code_ref / config 全寫在這。

反向索引（**Used by pipelines** / **Applied to APIs**）由 aggregator 從 pipelines order + apis middlewares 自動推，**不手寫** `used_by`。

**per-request 狀態**：Gin `c.Set/Get` / FastAPI `request.state` / Django `request.attr` / Koa `ctx.state` / Spring `request.setAttribute`。

---

## 8. Step 規則（apis / workers 共用）

| 欄位 | 必要 | 用途 | 範例 |
|---|---|---|---|
| `order` | ✓ | int 序號（從 1 遞增） | `1` |
| `action` | ✓ | snake_case 動詞片語 | `bind_json_body` / `publish` / `respond` |
| `target` |  | `<kind>:<id>`；kind ∈ table/topic/integration/worker | `table:conversion` / `topic:tasks` |
| `code_ref` |  | `<file>#<Symbol>` | `internal/app/service/x.go#CreateX` |
| `rule` |  | validation 描述 / SQL 片段 | `"WHERE id=? AND deleted_at IS NULL"` |
| `schema` |  | publish / unmarshal 的 struct 名 | `TaskMessage` |
| `body` / `status` |  | 搭 `action: respond` | `XResponse` / `201` |
| `to` |  | status transition 目標值 | `completed` |
| `path` |  | 資源路徑（含 `{var}` 模板） | `"audio/converted/{name}{ext}"` |
| `note` |  | non-obvious 行為 / known quirk | `"publish 失敗僅 log"` |
| `failure_semantic` |  | `block` (default) / `best_effort` / `log_only` | `best_effort` |
| `target_api_ref` |  | 跨 repo 呼叫 `<repo>:<api-id>` | `"media-svc:audio-convert"` |

### action 命名（慣例不強制；保持跨 repo 一致對 aggregator drill-down 較好）

| 類別 | 動詞 |
|---|---|
| input | `bind_json_body` / `parse_path_param` / `parse_query_params` |
| validate | `validate_<thing>` |
| DB | `get_/list_/count_/insert_/update_/delete_/upsert_<entity>` + `update_status` / `set_<field>` |
| external | `publish` / `call_<op>` / `sync_<x>_to_<sys>` / `upload_file` / `download_file` / `send_metric_event` |
| response | `respond` / `return_error` / `abort` |

### failure_semantic

| 值 | 行為 | 典型情境 |
|---|---|---|
| `block` (預設可省略) | 失敗中斷主流程，呼叫方收錯 | DB 寫、主要外部 API、CDP 同步 |
| `best_effort` | 失敗 log 後繼續；影響後續但非 fatal | optional enrichment / 次要查詢 |
| `log_only` | fire-and-forget；caller 無視結果 | metric event / engagement event |

---

## 9. Sequence diagram（`sequence_mermaid` 必填）

### Participants（依實際碰到的取捨）

| 縮寫 | 對應 |
|---|---|
| `C` | Client（外部呼叫方） |
| `A` | API handler（gin / fastapi / express / ...） |
| `S` | `<ServiceName>` — application service 層 |
| `DB` / `R` | Postgres / Redis |
| `PS` / `W` | Pub/Sub broker / 下游 worker |
| `X` | `<integration-name>` — 外部 / 跨 repo HTTP |
| `ES` / `BQ` / `GCS` | Elasticsearch / BigQuery / Cloud Storage |

### Arrow ↔ steps[] 對應

| Arrow | 對應 step |
|---|---|
| `C->>A: METHOD /path` | request 起始（隱含 parse / bind plumbing） |
| `A->>A: <middleware chain>` | 整條 middleware pipeline 合成**一行** |
| `A->>A: <inline check>` | 每個 `inline_auth_checks[]` **一行**；不准跟 middleware 合併 |
| `A->>S: <ServiceMethod>(...)` | handler 呼 service |
| `S->>S: <validation>` | service-layer 業務驗證 |
| `S->>DB: <action-phrase or SQL>` | DB read / write（見下 SQL 粒度） |
| `DB-->>S: <result>` | DB 回傳（簡短） |
| `S->>X: <op>(...)` + `X-->>S: <result>` | external / cross-service |
| `S->>PS: Publish <Schema>{...}` | publish |
| `Note over X,Y: failure_semantic=<sem>` | 非 `block` 的 publish / external 標註 |
| `PS-->>W: deliver` | worker 非同步消費（**dashed**） |
| `A-->>C: <status> + <body>` | HTTP response（隱含 `respond`） |
| `alt` / `else` / `opt` | 分支（互斥 dispatch / feature flag） |

### 可省略（plumbing，已隱含在 C→A 或 A→C）

`parse_path_param` / `bind_json_body`（純 plumbing 時）/ `get_credential` / `marshal_metadata` / `respond`。

### 必須獨立 arrow（跨層級不合併）

- middleware 層 vs handler inline check vs service validation **各自一行**
- 每個獨立錯誤碼的 business validation（quota / duplicate / ownership / format）
- 每個 DB read / write（含必要 SQL 片段）
- 每個 publish / external call（含 `Note over` failure_semantic）
- 每個 status transition
- 共用 topic 上**每種 event type**（同 handler 往同 topic 發多種事件，每種獨立 arrow）

**簡短同層驗證合併例外**：同層級、單分支、無獨立錯誤碼者可合併
```
A->>A: bind body & validate <field> format
```

### DB arrow SQL 粒度

**Default**：action-phrase（`get / list / count / insert / update / delete <entity> ...`）。

**保留 SQL 片段的 7 個觸發點**：

1. **soft-delete filter**（`AND deleted_at IS NULL` 影響結果是否正確）
2. **JOIN 有業務意義**（JOIN 哪張表是關鍵資訊）
3. **UPSERT / ON CONFLICT**（reactivate / do-nothing / do-update 必顯式）
4. **partial unique index 查 dup**（必須明確排除 soft-deleted）
5. **soft-delete 寫回**（`UPDATE ... SET deleted_at = NOW()` 標示非 hard delete）
6. **cursor / 特殊 ORDER BY**（cursor-based 分頁排序是關鍵）
7. **subquery / CTE / window function**（查詢結構本身是核心邏輯）

**判斷問句**：「換成 5 字 action-phrase，讀者會不會遺漏什麼？」遺漏 → 保留 SQL；不會 → action-phrase。

### 分支 alt / else / opt

```
alt downstream 回 2xx
  X-->>S: Response (...)
  A-->>C: 201 + ...
else downstream 失敗
  X-->>S: non-2xx / network error
  A-->>C: 502 REMOTE_PROCESS
end
```

### 巢狀分支禁止

`alt` / `opt` / `loop` **不要互相 nest**（renderer 會把第二層以下畫斷，圖變兩截）。

- 最外層 `alt / else` 留給**真正互斥的 dispatch**（feature flag primary vs legacy / kind=a/b/c / webhook vs internal 雙入口）
- 內部條件改用 `Note over <P>: if <cond>, <behavior> and return` 線性敘述
- 完整條件 / 錯誤碼語意保留在 `steps[]` 的 `note` / `rule` — mermaid 只畫 happy path + 最外層互斥
- 沒有互斥 dispatch 時（大多數 API）**完全不用** `alt`

完整 flatten 樣板 + 反例見 `manifest-validate` skill Class B3。

---

## 10. Pub/Sub 三處記錄（任何對外發事件都必須）

任何 API / worker / job 對外發事件（Pub/Sub publish、`*EventBroker.Submit*` / `SubmitAuditLog` / `SendMetricEvent` 或等價 broker）必須**同時**在三處記錄：

| 位置 | 內容 |
|---|---|
| `apis/<id>.yaml` 或 `workers/<id>.yaml` 的 `steps[]` | step：`action: publish`（或 `submit_<event>_event`）、`target: topic:<id>`、`schema: <Struct>`；非 `block` 要標 `failure_semantic` |
| 同檔 `uses.topics_produced[]`（或 `log_sinks_produced[]`） | topic / sink id |
| `topics/<id>.yaml`（或 `integrations/<id>.yaml` kind=cloud-logging-sink） | 檔必須存在；`message_schema.fields[]` 列事件欄位；共用 topic 的 event type 變體列在 `attributes[]` 或 `fields[].enum` |

### 不可省略的情境

- publish 失敗只 log（`failure_semantic: log_only`）—— 下游仍依賴此事件
- 單一 handler 觸發多個 event type → **每個 event type 各列一個 step**，不合併
- Worker 消費 → 再 publish 鏈式事件，上下兩個 publish 都要寫
- `go broker.Submit(...)` fire-and-forget 也要記
- 失敗分支裡的 publish（e.g. DB update 失敗時仍 SubmitAuditLog）

### 最容易漏寫

- service layer helper 內部 publish（grep 必須追到最內層 broker call）
- `defer` / `finally` 區塊裡的 publish
- 多 event type 共用同 topic — grep `topic.Publish` 只看到一個 topic，但實際多種 event，從 attribute / message payload 辨識

---

## 11. description 欄位寫什麼（所有 entity 共通）

**功能摘要，不是流程步驟**。

| | 寫 | 不寫 |
|---|---|---|
| ✅ | 這支 API / worker 做什麼業務 | step 流程順序（那是 `steps[]`） |
| ✅ | 關鍵邊界（非直覺 side-effect、feature flag 切換、特殊錯誤碼） | 內部 service 方法鏈（那是 `code_ref` + `sequence_mermaid`） |
| ✅ | 主要依賴（外部系統、重要 table、發出事件） | request / response 欄位（那是 `fields[]`） |

**長度**：1-3 句。超過代表資訊應放別處。

**反例**：
```yaml
description: |
  消費 X topic 執行 workflow。
  Primary flow (9 step): A → B → C → ...
  Legacy flow (4 step): A → B → ...
```
把 step 流程塞進 description — `steps[]` 已完整列，重複且會 drift。

**正例**：
```yaml
description: |
  消費 X topic 執行 member 自動回覆；含 debounce / quota / handover / reply 發送 / ai_events 紀錄。依 feature flag 切換新版 planner 或 legacy 兩路 implementation。
```

---

## 12. schema_ref inline type

Handler 內 inline 定義的 response struct（Go / Python 常見）：

```go
func ListTags(app *app.Application) gin.HandlerFunc {
    type ResponseTag struct { ... }                  // inline 型別
    type Response struct { Tags []ResponseTag }
    return func(c *gin.Context) { ... }
}
```

| 格式 | 範例 | 對應 |
|---|---|---|
| `<file>#<Symbol>` | `internal/router/payload/tag.go#Tag` | payload package 頂層型別 |
| `<file>#<OuterFunc>.<InnerType>` | `internal/router/handler.go#ListTags.Response` | handler function 內 inline 定義 |

匿名 struct literal：`<OuterFunc>.__inline_response__`。

---

## 13. Cross-reference 規則

### `uses.*` 的 id 來源

| 欄位 | id 來自 |
|---|---|
| `uses.tables` | `tables/<id>.yaml#id` |
| `uses.topics_produced` / `topics_consumed` | `topics/<id>.yaml#id` |
| `uses.integrations` | `integrations/<id>.yaml#id` |
| `uses.workers_triggered` | `workers/<id>.yaml#id` |
| `uses.log_sinks_produced` | `integrations/<id>.yaml`（kind=cloud-logging-sink）`#id` |
| `apis/*.yaml#middlewares[].id` | `middlewares/<id>.yaml#id` |

### Step `target` 格式

```
table:<id>  /  topic:<id>  /  integration:<id>  /  worker:<id>
```

### 跨 repo 直連：`steps[].target_api_ref`

格式 `"<target-repo-id>:<target-api-id>"`。**宣告式** — A 寫的當下 B manifest 不需存在；aggregator render 時才解析：

| 目標狀態 | Render |
|---|---|
| B 已 index | 藍色可點連結 |
| B 未 index / api id 錯 | 灰色虛線 `pending` badge（UI 即時看到 drift） |

**只做 forward**（caller → callee）；不做 back-link（callee 側不會自動列 "called by" — 真相分散在各 caller repo，無法保證 staleness / completeness）。

**何時寫**：確定呼叫另一 repo 的特定 API 且想方便人類跳過去看時。純文字夠清楚就不必填。

---

## 14. 常見陷阱

| 問題 | 錯寫 | 正確 |
|---|---|---|
| 寫完 entity yaml 忘了 service.yaml index | `apis/foo.yaml` 寫好但 `service.yaml#apis[]` 沒加 | 任何 entity 寫 / 改 / 刪都同步 service.yaml 對應 list |
| YAML list 混 scalar 與 map | `- update_status: failed` + `- set_error_message`（parser 炸） | 統一 map：`- action: update_status` |
| Webhook 塞進 integrations | `integrations/<provider>-webhook.yaml` 當獨立整合 | webhook 寫在 `apis/`（`endpoint_type: webhook`）；integrations 用 `inbound.webhook_endpoints` 指回 |
| API 多版本塞單檔 | `versions: [v1, v2]` 內聯 | 一版一檔：`<id>.v1.yaml` / `<id>.v2.yaml` |
| 雙邊宣告跨 repo 關係 | `called_by: [repo-a]` | 單邊宣告；aggregator 反向 join |
| Cloud Logging sink 當 Pub/Sub | `topics_produced: [metric-events]` | `log_sinks_produced:`；sink 建 `integrations/<id>.yaml kind: cloud-logging-sink` |
| 重複寫 middleware 細節 | 每支 API 都寫 `code_ref` / `config_env` | API 只留 `- id: bearer-auth`；詳細在 `middlewares/<id>.yaml` |

---

## 15. Aggregator 自動處理（人類**不要**手寫）

| 自動項目 | 依據 |
|---|---|
| API list 分群 | `path`（或 override `group`） |
| Table list 分群 | `id` 底線前綴（或 override `group`） |
| Sidebar 超過 15 條自動分群 | 同上 |
| `read_by` / `consumed_by` / **Used by pipelines** / **Applied to APIs** 反向索引 | 各 entity 的 `uses.*` / pipelines `order[]` / apis `middlewares[]` |
| Cmd+K 搜尋 index | 全 entity id / title / description |
| 跨 repo producer ↔ consumer（topic id 對齊） | aggregator 建構時自動 join |

**原則**：能從既有欄位推得 → **不設計人工欄位**（避免 drift）。
