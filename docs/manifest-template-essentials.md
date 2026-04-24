# Manifest Template — Essentials for Update / Validate

> 從 `manifest-template.md`（1339 行）抽出 **cartograph-update / manifest-validate / patch 單一 yaml** 時真正會對照的部分。約 400 行，一次讀得完。
>
> **跳過了**：folder structure / service.yaml top metadata / API 版本化 & group 推算 / webhook 特化 / worker kind-specific layouts / onboarding / schema 演進 / pilot 紀錄。需要時再回 `manifest-template.md` 查。

---

## 核心原則（§2）

1. 單邊宣告：只寫自己這側做什麼；跨 repo 關係 aggregator 靠 id 對齊 join
2. 一個實體一份檔
3. ID 為 join key：`uses.*` 透過 id 字串對齊
4. 不重複 OpenAPI：request/response schema 用 `schema_ref` 指向既有 source
5. Mermaid 內嵌字串（不是 file ref）
6. Integration 方向靠欄位 `directions: [inbound, outbound]`，不拆資料夾

---

## Step 所有欄位總表（§4）— CRITICAL

| 欄位 | 必要 | 類型 | 用途 | 範例 |
|---|---|---|---|---|
| `order` | ✓ | int | 序號（從 1 遞增） | `1` |
| `action` | ✓ | string | 動詞 snake_case | `bind_json_body` / `insert_row` / `publish` / `respond` |
| `target` |  | string | `<kind>:<id>`；kind = `table` / `topic` / `integration` / `worker` | `table:organization` / `topic:audit-events` |
| `code_ref` |  | string | `<file>#<Symbol>` | `internal/app/service/org_service.go#CreateOrg` |
| `rule` |  | string | validation / SQL 片段 | `"WHERE org_id=? AND deleted_at IS NULL"` |
| `schema` |  | string | publish / unmarshal 的 struct 名 | `TaskMessage` / `AuditLog` |
| `body` |  | string | response body 型別（搭 `action: respond`） | `AudioConvertResponse` |
| `status` |  | int\|string | HTTP status（搭 `action: respond`） | `200` / `201` / `204` |
| `to` |  | string | status transition 目標值 | `completed` / `failed` |
| `path` |  | string | 資源路徑，支援 `{var}` 模板 | `"audio/converted/{name}{ext}"` |
| `note` |  | string | 非直覺行為 / known quirk | `"publish 失敗僅 log"` |
| `optional` |  | bool | 舊欄位；建議改用 `failure_semantic` | `true` |
| `failure_semantic` |  | enum | `block` / `best_effort` / `log_only` | `best_effort` |
| `target_api_ref` |  | string | 跨 repo 呼叫 `<repo>:<api-id>` | `"repo-b:audio-convert"` |

### action 命名慣例

| Pattern | 意義 | 常搭配 |
|---|---|---|
| `bind_json_body` / `parse_path_param` | input 解析 | `schema` / `note` |
| `validate_<thing>` | 輸入 / 業務驗證 | `rule` / `code_ref` |
| `get_<resource>_by_<key>` / `list_<resource>` | DB 讀 | `target: table:*` / `rule` |
| `insert_row` / `update_row` / `delete_row` | DB 寫 | `target: table:*` / `rule` |
| `update_status` / `set_<field>` | status transition | `target: table:*` / `to` |
| `publish` | Pub/Sub | `target: topic:*` / `schema` / `failure_semantic` |
| `upload_file` / `download_file` | 物件儲存 | `target: integration:gcs` / `path` |
| `call_<operation>` / `sync_<thing>_to_<system>` | 外部 HTTP / cross-service | `target: integration:*` / `failure_semantic` |
| `send_metric_event` / `log_<event>` | Cloud Logging sink | `target: log_sink:*` / `schema` |
| `respond` | HTTP 回應 | `body` / `status` |
| `return_error` / `abort` | 早退 | `status` / `note` |

### failure_semantic 語義

| 值 | 行為 | 典型情境 |
|---|---|---|
| `block`（預設可省略） | 失敗必中斷，呼叫方收錯 | DB 寫、主要外部 API、CDP 同步 |
| `best_effort` | 失敗 log 後繼續；影響後續但不 fatal | assignment 查詢、optional enrichment |
| `log_only` | fire-and-forget | metric event / engagement event |

---

## Sequence diagram 記錄原則（§4）— CRITICAL（required field）

### Participant 骨架

| 縮寫 | 對應 | 何時列 |
|---|---|---|
| `C` Client | 外部呼叫方 | 所有 API |
| `A` API | handler | 所有 API |
| `S` <ServiceName> | application service 層 | handler 呼 service 時 |
| `DB` Postgres | 關聯式 DB | 有 DB 讀寫 |
| `R` Redis | cache / lock | 有 Redis 操作 |
| `PS` Pub/Sub | broker | 有 publish |
| `W` <worker-id> | 後續 worker | publish 後下游有 worker（dashed arrow） |
| `X` <integration-name> | 外部 HTTP / 跨 repo | outbound call |
| `ES` / `BQ` / `GCS` | Elasticsearch / BigQuery / Cloud Storage | 有用時 |

### Arrow 類型 vs steps[] 對應

| Arrow | 對應 step | 範例 |
|---|---|---|
| `C->>A: METHOD /path` | request 起始（隱含 parse/bind plumbing） | `C->>A: POST /api/v1/orgs/:org_id/themes` |
| `A->>A: <middleware chain>` | middleware pipeline 合成**一行** | `A->>A: base + bearer-auth + acl` |
| `A->>A: <inline check>` | 每個 `inline_auth_checks[]` 一行 | `A->>A: CheckOrgResourceInCredentialScope(orgID)` |
| `A->>S: <ServiceMethod>(...)` | handler 呼 service | `A->>S: CreateTheme(orgID, title, ...)` |
| `S->>S: <validation>` | service-layer business validation | `S->>S: validate title length 1..20` |
| `S->>DB: <action-phrase or SQL>` | DB read / write | `S->>DB: get org by id` |
| `DB-->>S: <result>` | DB 回傳（簡短） | `DB-->>S: existing theme` |
| `S->>X: <operation>` | external / cross-service | `S->>X: GetBillingFeature(feature_code)` |
| `X-->>S: <result>` | external response | `X-->>S: Quota{balance, usage}` |
| `S->>PS: Publish <Schema>{...}` | publish | `S->>PS: Publish DeleteTagMembers{org_id, tag_id}` |
| `Note over ...: failure_semantic=<X>` | publish/external 失敗標註 | `Note over S,PS: failure_semantic=log_only` |
| `PS-->>W: deliver` | worker 非同步消費（**dashed**） | `PS-->>W: deliver` |
| `A-->>C: <status> + <body>` | HTTP response（隱含 respond） | `A-->>C: 201 + Theme` |
| `alt` / `else` / `opt` | 分支 | 成功 vs 失敗 / feature flag |

### 可省略（plumbing，已隱含在 C→A 或 A→C）

- `parse_path_param` / `parse_query_params`
- `bind_json_body`（若只是 plumbing；欄位驗證是重點就要獨立 arrow）
- `get_credential` / `get_user_info_from_context`
- `marshal_metadata` / `compose_payload`（可合併成下個真實 arrow 的 payload 附註）
- `respond`（已隱含在 A-->>C）

### 必須獨立 arrow（不准合併）

- **跨層級不合併**：middleware 層 vs handler inline check vs service validation 必須分開
  - ✅ `A->>A: base + bearer-auth` + `A->>A: CheckOrgResourceInCredentialScope`
  - ❌ `A->>A: base + bearer-auth + inline org scope check`
- 每個 business rule validation（有獨立錯誤碼）— quota / duplicate / ownership / format
- 每個 DB read / write（含簡短 SQL 條件）
- 每個 publish / external call（含 `failure_semantic` Note）
- 每個 status transition
- 每種共用 topic 上的 event type（若 handler 往同一個 topic 發多種 event 變體）

### 簡短 validation 合併例外

同層級、單一分支、無獨立錯誤語意的驗證可合併：
```
A->>A: bind body & validate audio_url scheme = https
```
（都是 handler 層輸入處理，錯誤碼都 = 400 PARAMETER_INVALID）

### DB arrow 的 SQL 粒度規則

**預設用 action-phrase**；SQL 片段只在「查詢語意影響讀者理解」時才寫。

| 情境 | 寫法 |
|---|---|
| 單筆 get by id | `S->>DB: get <entity> by id` |
| 單純 list | `S->>DB: list <entities> by <scope>` |
| Count | `S->>DB: count <entity> by <scope>` |
| 單欄 update | `S->>DB: update <entity> status` |
| **soft-delete filter** | `S->>DB: SELECT FROM <entity> WHERE <scope>=? AND deleted_at IS NULL` |
| **JOIN 有業務意義** | `S->>DB: SELECT team.* FROM team_user JOIN team WHERE user_id=?` |
| **UPSERT / ON CONFLICT** | `S->>DB: UPSERT INTO tag (org_id, name) ON CONFLICT reactivate` |
| **partial unique dup check** | `S->>DB: SELECT FROM theme WHERE org_id=? AND title=? AND deleted_at IS NULL` |
| **soft-delete 寫回** | `S->>DB: UPDATE <entity> SET deleted_at=NOW() WHERE id=?` |
| **cursor / 特殊排序** | `S->>DB: list backup_record by org_id ORDER BY created_at DESC, id DESC` |
| **subquery / CTE / window** | 保留 SQL 片段 |

**反例**（不該寫 SQL）：
- ❌ `S->>DB: SELECT FROM organization WHERE id=?` → ✅ `S->>DB: get org by id`
- ❌ `S->>DB: INSERT INTO theme (...) RETURNING *` → ✅ `S->>DB: insert theme`
- ❌ `S->>DB: SELECT COUNT(*) FROM ...` → ✅ `S->>DB: count <entity>`

**判斷**：「SQL 換成 5 個字 action-phrase，讀者會不會遺漏什麼？」遺漏 → 保留 SQL；不會 → action-phrase。

### 失敗 / 條件分支用 `alt` / `else` / `opt`

```
alt downstream 回 2xx
  X-->>S: ConversionResponse (id, status=pending, ...)
  A-->>C: 201 + {conversion_id, uuid}
else downstream 失敗
  X-->>S: non-2xx / network error
  A-->>C: 502 REMOTE_PROCESS
end
```

### 巢狀分支最多一層（CRITICAL）

**規則**：`alt` / `opt` / `loop` 彼此**不要巢狀**。`scan_manifest.py` Class B3 會警告；部分瀏覽器 mermaid renderer 碰到 `alt { alt {...} }` 或 `alt { opt {...} }` 會把第二層以下畫斷，圖變兩截。

**取捨**：
- 最外層 `alt` 僅留給**真正互斥的 dispatch**（例：primary vs fallback implementation 由 feature flag 切換；webhook vs internal 雙入口；kind=a/b/c 等）。
- 其他決策點改用 `Note over X,Y: if <cond>, <behavior> and return` 線性敘述 + 早退 arrow（例 `S-->>W: nil (drop)`）。
- 分支完整語意保留在 `steps[]` 的 `note` / `rule` 欄位；mermaid 只畫 happy path + 最外層 mutual-exclusive 分支。
- 當沒有互斥 dispatch 時（大多數 API），直接線性 arrow + Note 即可，**完全不用** `alt`。

**標準 flatten 樣板**（feature flag 切換兩路 implementation 的 worker）：

```
alt primary implementation (flag on)
  W->>P: RunWorkflow(param)
  P->>DB: loadSessionContext
  P->>P: checkQuota
  Note over P: if quota exceeded, handover and return
  P->>P: needHandoverCheck
  Note over P: if needHandover, executeHandover and return
  P->>X: callExternalOrToolLoop
  Note over P,X: handover triggers (sentinel / errHandoverNeeded / other err) → executeHandover and return
  P->>Y: sendReplyAdapter
  P-->>W: err or nil
else legacy (flag off)
  W->>L: RunLegacyWorkflow(param)
  ...
end
```

反例（**不要這樣寫**）：

```
alt flag on
  opt CheckDebounce
    alt debounced ... end
  end
  alt quota exceeded ...
  else within cap
    alt needHandover ...
    else continue
      alt self-hosted ...  ← 已經 5 層，renderer 會斷
```

---

## Pub/Sub / event 記錄原則（§4）— CRITICAL

任何 API / worker / job 有對外發事件（Pub/Sub publish、`*EventBroker.Submit*` / `SubmitAuditLog` / `SendMetricEvent` 或等價的 broker 抽象），必須**同時**在三處記錄：

| 位置 | 寫什麼 |
|---|---|
| `apis/<id>.yaml` 或 `workers/<id>.yaml` 的 `steps[]` 一個 step | `action: publish` / `submit_<event>_event`；`target: topic:<topic-id>`；`schema: <MessageStruct>`；publish 失敗僅 log 要標 `failure_semantic: log_only` |
| 同檔 `uses.topics_produced[]`（或 `log_sinks_produced[]` 若非 Pub/Sub） | 該 topic / sink 的 id |
| `topics/<topic-id>.yaml`（或 `integrations/<sink-id>.yaml` kind=cloud-logging-sink） | 檔必須存在；`message_schema.fields[]` 列事件欄位；共用 topic 分多 event type 必須在 `attributes[]` 或 `message_schema.fields[].enum` 列所有變體 |

### 不可省略的情境

- publish 失敗只 log（即使不影響 API 回應，下游仍依賴此事件）
- 單一 handler 觸發多個 event type —— **每個 event type 各列一個 step**，不合併
- Worker 消費一個 event 再 publish 下一個（鏈式），上下兩個 publish 都要寫
- `go broker.SubmitEvent(...)` fire-and-forget 也要記
- 錯誤 / 失敗分支裡的 publish（例如 `PartialUpdateOrganization` 失敗時仍 SubmitAuditLog）

### 最容易漏寫

- Service layer helper function 內部 publish — grep 必須追到最內層 broker call
- `defer` / `finally` 區塊裡的 publish
- 多個 event type 共用同一 topic（grep `topic.Publish` 只看到「一個 topic」，實際是**多種 event**，需額外從 attribute / message payload 辨識）

---

## schema_ref inline type（§4.5）

Handler 內 inline 定義的 response struct：

```go
func ListTags(app *app.Application) gin.HandlerFunc {
    type ResponseTag struct { ... }
    type Response struct { Tags []ResponseTag }
    return func(c *gin.Context) { ... }
}
```

`schema_ref` 兩種格式：

| 格式 | 範例 | 對應 |
|---|---|---|
| `<file>#<Symbol>` | `internal/router/payload/tag.go#Tag` | payload package 頂層型別 |
| `<file>#<OuterFunc>.<InnerType>` | `internal/router/handler_tag_tag.go#ListTags.Response` | handler 內 inline 定義 |

Inline 匿名 struct：`<OuterFunc>.__inline_response__`。

---

## description 欄位寫什麼（CRITICAL — 所有 entity 共通）

API / Worker / Table / Topic / Integration / Middleware 的 `description` 都是**功能摘要**，不是流程步驟。

| | 寫 | 不寫 |
|---|---|---|
| ✅ | 這支 API / worker 做什麼業務 | step 流程順序（那是 `steps[]`） |
| ✅ | 關鍵邊界條件（非直覺 side-effect、feature flag 切換路徑、特殊錯誤碼） | 內部 service 方法鏈（那是 `code_ref` + `sequence_mermaid`） |
| ✅ | 主要依賴（外部系統、重要 table、發出的事件） | request/response 欄位說明（那是 `request.fields[]` / `response[]`） |

**長度**：1–3 句。超過 3 句通常代表資訊應該放別的欄位。

**反例**（常見壞味道）：
```yaml
description: |
  消費 X topic 執行 workflow。
  Primary flow（9 step）：debounce → loadSessionContext → ensureHandledConversation → checkQuota → ...
  Legacy flow（4 step）：debounce → validateAndPrepare → handleFirstMessage → ...
```
把 step 流程塞進 description — `steps[]` 已經完整列出，重複且會 drift。

**正例**：
```yaml
description: |
  消費 X topic 執行對 member 的自動回覆；包含 debounce / quota / handover check / reply 發送 / ai_events 紀錄。依 feature flag 切換新版 planner 或 legacy 兩路 implementation。
```

---

## API 所有欄位總表（§4）

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | repo 內唯一 |
| `version` |  | string | `v1` / `v2`；單版本可省 |
| `status` |  | enum | `active` / `deprecated` / `sunset` |
| `deprecated_in` |  | date | `"2026-12-01"` |
| `replaced_by` |  | string | 後續版本 id |
| `endpoint_type` |  | enum | `rest`(default) / `webhook` / `internal` |
| `group` |  | string | 自動推；僅 override 時寫 |
| `method` | ✓ | enum | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` |
| `path` | ✓ | string | `/api/v1/...` |
| `component` | ✓ | string | 指回 `service.yaml#components[].id` |
| `description` | ✓ | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `auth` | ✓ | string | `none` / `bearer_token` / `webhook-signature` / ... |
| `code_ref` | ✓ | string | `<path>#<Symbol>` |
| `openapi_ref` |  | string | OpenAPI JSON pointer |
| `middleware_pipeline` | ✓ | string | 指回 `service.yaml#middleware_pipelines[].id` |
| `middlewares[]` | ✓ | list | 每項 `{ id }` + 選填 `code_ref` / `config_env` / `note`（但只留 id 即可，詳細寫在 `middlewares/<id>.yaml`） |
| `inline_auth_checks[]` |  | list | `{ name, code_ref, scope, note }`；handler/service layer inline 驗證 |
| `request` |  | map | `{ content_type, schema_ref, path_params[], headers_optional[], fields[], body }` |
| `response[]` | ✓ | list | `{ status, schema_ref?, body?, error_code?, note?, fields[]? }`；`fields[]` = `{ name, type, nullable?, enum?, description? }` |
| `steps[]` |  | list | 見上；可為空 `[]` |
| `uses` | ✓ | map | 6 key：`tables` / `topics_produced` / `topics_consumed` / `integrations` / `workers_triggered` / `log_sinks_produced` |
| `sequence_mermaid` | ✓ | string | 完整 Mermaid `sequenceDiagram`，required |
| `signature_header`（webhook） |  | string | `X-Hub-Signature-256` |
| `verification_token_env`（webhook） |  | string | env var name |

---

## Worker 所有欄位總表（§5）

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | repo 內唯一 |
| `kind` |  | enum | `pubsub-subscriber`(default) / `scheduler` / `cron` / `cloud-tasks-worker` |
| `component` | ✓ | string | 指回 `service.yaml#components[].id` |
| `description` | ✓ | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `binary` |  | string | 啟動命令 |
| `code_ref` |  | string | handler 進入點 |
| `subscribes_topic` | (pubsub) | string | 指回 `topics/<id>.yaml#id` |
| `subscription_pattern` |  | string | 可含 `{env}` |
| `subscription_env` |  | string | env var name |
| `receive_settings` |  | map | Pub/Sub client 設定 |
| `schedule` | (cron) | string | cron expression |
| `trigger` |  | string | `cloud-scheduler` / `k8s-cronjob` |
| `processors[]` |  | list | `{ id, conversion_type?, code_ref?, status? }` |
| `idempotency` |  | map | `{ strategy?, rule?, code_ref? }` |
| `ack_semantics` |  | map | `{ ack_on: [..], nack_on: [..] }` |
| `steps[]` |  | list | 同 apis.steps |
| `failure_handling` |  | map | 自由結構 |
| `uses` | ✓ | map | 同 apis.uses |
| `sequence_mermaid` | ✓ | string | required；與 API 同規則 |

---

## Table 所有欄位總表（§6）

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | 通常 = DB table 名 |
| `database` | ✓ | string | `postgres` / `mysql` / `clickhouse` |
| `description` |  | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `migration_ref` |  | string | migration 檔 path |
| `model_code_ref` |  | string | ORM model 定義位置 |
| `repo_code_ref` |  | string | repository 實作位置 |
| `group` |  | string | 自動推 |
| `columns[]` | ✓ | list | `{ name, type, primary_key?, nullable?, default?, enum?, description? }` |
| `indexes[]` |  | list | `{ name, columns[], unique?, type? }` |
| `read_by` |  | map | `{ apis: [...], workers: [...] }` |
| `write_by` |  | map | 同上 |

---

## Topic 所有欄位總表（§7）

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | topic name（全 org 唯一） |
| `provider` | ✓ | string | `gcp-pubsub` / `kafka` / `nats` |
| `gcp_project_pattern` |  | string | hint |
| `description` |  | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `schema_ref` |  | string | message struct 定義位置 |
| `publisher_code_ref` |  | string | 發布方 code ref |
| `consumer_code_ref` |  | string | 消費方 code ref |
| `message_schema` |  | map | `{ fields: [{name, type, required?, nullable?, enum?, description?}] }` |
| `attributes[]` |  | list | `{ name, type?, description? }` |
| `produced_by[]` |  | list | `{api: id}` / `{worker: id}` |
| `consumed_by[]` |  | list | 同上；可加 `subscription` |
| `known_external_consumers[]` |  | list | `{ repo, note? }` |
| `retry_policy` |  | map | 結構自由 |
| `delivery_guarantee` |  | string | `at-least-once` |

---

## Integration 所有欄位總表（§8）

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | 平台短名 |
| `kind` | ✓ | string | `cloud-storage` / `cli-tool` / `outbound-http` / `messaging-platform` / `payment-webhook` / `cloud-logging-sink` |
| `provider` |  | string | 廠商名 |
| `directions` | ✓ | list | `[outbound]` / `[inbound]` / `[inbound, outbound]` |
| `description` |  | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `code_ref` |  | string | adapter 入口 |
| `local_impl` |  | string | 本機模擬實作 path |
| `local_impl_note` |  | string | 本機模擬說明 |
| `docker` |  | string | container 需求 |
| `notes[]` |  | list | free-form |
| `inbound` |  | map | `{ webhook_endpoints[], auth?, signature_header?, verification_env?, note? }` |
| `outbound` |  | map | `{ operations[], auth?, auth_env?, rate_limits? }` |
| `outbound.operations[]` |  | list | `{ id, method?, url?, code_ref?, description?, failure_semantic? }` |
| `bucket_pattern`（cloud-storage） |  | string | |
| `bucket_env`（cloud-storage） |  | string | |
| `paths[]`（cloud-storage） |  | list | `{ path, direction, note?, used_by? }` |
| `external_writers[]`（cloud-storage） |  | list | `{ id, writes_path, note? }` |
| `auth` |  | string | kind-level auth |
| `invocation`（cli-tool） |  | string | `shell-exec` / `lib-call` |
| `binary_required[]`（cli-tool） |  | list | 預裝二進制名 |
| `operations[]` |  | list | `{ id, code_ref?, description? }`（kind-level；與 outbound.operations 區隔） |
| `protocol`（outbound-http） |  | string | `http` / `https` / `grpc` |
| `method`（outbound-http） |  | string | |
| `url`（outbound-http） |  | string | 可用 `{}` template |
| `security` |  | map | `{ scheme_whitelist?, validation_code_ref?, note? }` |
| `used_by` |  | map | `{ apis: [...], workers: [...] }` |

### outbound.operations[].failure_semantic 判斷

| caller 寫法 | operation 的 failure_semantic |
|---|---|
| `if err := cdp.BatchUpdate(...); err != nil { return err }` | `block` |
| `if err := broker.SubmitEvent(...); err != nil { logger.Error()... /* 不 return */ }` | `best_effort` |
| `go broker.SubmitEvent(...)` / no return value checked | `log_only` |

### cloud-logging-sink（非 Pub/Sub 的事件外送）

用 zerolog `cloud_logging_sink:` 欄位做事件路由。欄位：`sink_name_pattern` / `events[]`；使用端在 `uses.log_sinks_produced` 引用 id。

---

## Middleware（§8.5）

### 所有欄位總表

| 欄位 | 必要 | 類型 | 範例 / 說明 |
|---|---|---|---|
| `id` | ✓ | string | repo 內唯一；與 `service.yaml#middleware_pipelines[].order[]` 的 id 字串對齊 |
| `kind` | ✓ | enum | `auth` / `observability` / `input-validation` / `rate-limit` / `error-handling` / `panic-recovery` / `request-id` / `other` |
| `description` |  | string | 一行（詳規則見 §「description 欄位寫什麼」） |
| `code_ref` |  | string | `<path>#<Symbol>`；內建 middleware 可省改用 `provided_by` |
| `provided_by` |  | string | 例：`gin-framework` |
| `config` |  | map | `{ env_vars: [], secret_source?, note? }` |
| `reads_context[]` |  | list | `{ key, type?, description? }` |
| `writes_context[]` |  | list | 同上 |
| `error_responses[]` |  | list | `{ status, error_code?, when? }` |
| `order_constraints[]` |  | list | `{ must_be_after? / must_be_before?, reason? }` |
| `notes[]` |  | list | free-form |

### apis/<id>.yaml#middlewares[] 寫法

只列 id；詳細一律寫在 `middlewares/<id>.yaml`（single source of truth）：

```yaml
middlewares:
  - id: gin-recovery
  - id: bearer-auth
```

### 反向索引

Aggregator 自動推，**不手寫** `used_by`：
1. **Used by pipelines** — 從 `service.yaml#middleware_pipelines[].order[]` 掃
2. **Applied to APIs** — 從 `apis/*.yaml#middlewares[].id` 掃

---

## Cross-reference 規則（§9）

### uses.* 的 id 來源

| 欄位 | id 來自 |
|---|---|
| `uses.tables` | `tables/<id>.yaml#id` |
| `uses.topics_produced` / `topics_consumed` | `topics/<id>.yaml#id` |
| `uses.integrations` | `integrations/<id>.yaml#id` |
| `uses.workers_triggered` | `workers/<id>.yaml#id` |
| `apis/*.yaml#middlewares[].id` | `middlewares/<id>.yaml#id` |

### Step target 格式

```
table:<id>        # e.g. table:conversion
topic:<id>        # e.g. topic:repo-b-results
integration:<id>  # e.g. integration:gcs
worker:<id>       # e.g. worker:task-processor
```

### 跨 repo 自動連結：steps[].target_api_ref

格式 `"<target-repo-id>:<target-api-id>"`。A 寫的當下 B manifest 不需存在；aggregator render 時解析：

| 目標狀態 | Render |
|---|---|
| B 已 index | 藍色可點連結 |
| B 未 index | 灰色虛線 `pending` badge |
| B 已 index 但 api id 錯 | 同上灰色 badge（即時看到 drift） |

**只做 forward（caller → callee）**。target 那側不會自動列 "called by"。

**何時寫**：確定會呼叫另一個 repo 的 API 且想方便人類跳過去時才寫。純文字說明就夠清楚時不必填。

---

## 常見陷阱（§11）

| 問題 | 錯寫 | 正確 |
|---|---|---|
| YAML list 混 scalar 與 map | `- update_status: failed`\n`- set_error_message` | 統一為 map：`- action: update_status` |
| Webhook 塞進 integrations | `integrations/whatsapp-webhook.yaml` 當單獨整合 | webhook 寫在 `apis/` (`endpoint_type: webhook`)，integrations 用 `inbound.webhook_endpoints` 指回 |
| API 多版本塞進單檔 | `versions: [v1, v2]` 內聯 | 一個版本一檔：`send-message.v1.yaml` / `send-message.v2.yaml` |
| 雙邊宣告跨 repo 關係 | `called_by: [repo-a]` | 單邊宣告；aggregator 反向 join |
| Cloud Logging sink 當 Pub/Sub | `topics_produced: [metric-events]` | 用 `log_sinks_produced:`；sink 建 `integrations/<id>.yaml` `kind: cloud-logging-sink` |
| 重複寫 middleware `code_ref` / `config_env` | 每支 API 都寫完整 middleware 結構 | API 側只留 `- id: bearer-auth`；詳細寫在 `middlewares/<id>.yaml` |

---

## Aggregator 自動處理（§12）— 人類**不用寫**

| 自動項目 | 依據 |
|---|---|
| API list 分群 | `path` 欄位（或 override `group`） |
| Table list 分群 | `id` 底線前綴（或 override `group`） |
| Sidebar 當 entity 超過 15 條自動分群 | 同上 |
| `read_by` / `consumed_by` 等反向索引 | `apis/*#uses.*`、`workers/*#uses.*` |
| Cmd+K 搜尋 index | 全 entity id / title / description |
| 跨 repo producer ↔ consumer | topic id 對齊（Phase 2） |

**原則**：任何能從既有欄位推的，都不設計人工欄位（避免 drift）。
