import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const EntityRef = z.object({
  id: z.string(),
  file: z.string(),
});

const MiddlewarePipelineDef = z.object({
  id: z.string(),
  description: z.string().optional(),
  order: z.array(z.string()),
});

const EnvConfig = z.object({
  key: z.string(),
  used_by: z.array(z.string()).optional(),
  source: z.string().optional(),
  default: z.string().optional(),
});

const DeploymentEnv = z.object({
  id: z.string(),
  gcp_project: z.string(),
  region: z.string().optional(),
  // --- Cloud Run 類 ---
  api_url_pattern: z.string().optional(),
  gcs_bucket: z.string().optional(),
  cdn_url_prefix: z.string().optional(),
  // --- GKE / multi-deployment-model fields ---
  deployment_type: z
    .enum(["cloud-run", "gke-helm", "gke-raw", "k8s-deployment"])
    .optional(),
  shared_resource_project: z.string().optional(), // Pub/Sub 所在 project（當與 gcp_project 不同時）
  api_url: z.string().optional(),                  // 固定網域（非 Cloud Run wildcard）
  cdn_domain: z.string().optional(),
  db_instance: z.string().optional(),
  redis_instance: z.string().optional(),
  helm_values_ref: z.string().optional(),
  argocd_app_ref: z.string().optional(),
  terraform_ref: z.string().optional(),
  k8s_manifest_ref: z.string().optional(),
  image_repo: z.string().optional(),
});

const MiddlewareUse = z.object({
  id: z.string(),
  code_ref: z.string().optional(),
  config_env: z.string().optional(),
  note: z.string().optional(),
});

const RequestField = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  validation: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

const RequestHeader = z.object({
  name: z.string(),
  max_length: z.number().optional(),
});

const RequestPathParam = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
});

const RequestSchema = z.object({
  content_type: z.string().optional(),
  schema_ref: z.string().optional(),
  fields: z.array(RequestField).optional(),
  headers_optional: z.array(RequestHeader).optional(),
  path_params: z.array(RequestPathParam).optional(),
  body: z.string().optional(),
});

// Response body fields. Symmetric with RequestField but uses `nullable`
// instead of `required` — response is what the server returns, so the
// caller-side notion of "required input" doesn't apply; what matters is
// whether a field can be null / absent in the payload.
const ResponseField = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const ResponseSpec = z.object({
  status: z.number(),
  schema_ref: z.string().optional(),
  body: z.string().optional(),
  error_code: z.string().optional(),
  note: z.string().optional(),
  fields: z.array(ResponseField).optional(),
});

const Step = z.object({
  order: z.number(),
  action: z.string(),
  target: z.string().optional(),
  code_ref: z.string().optional(),
  rule: z.string().optional(),
  schema: z.string().optional(),
  note: z.string().optional(),
  body: z.string().optional(),
  status: z.union([z.number(), z.string()]).optional(),
  to: z.string().optional(),
  path: z.string().optional(),
  optional: z.boolean().optional(),
  // --- failure semantics for side-effect steps ---
  failure_semantic: z.enum(["block", "best_effort", "log_only"]).optional(),
  // --- cross-repo API direct-link ---
  // 格式 `<repo-id>:<api-id>`；aggregator 在 render 時查目標 repo+api 是否存在：
  //   存在  → clickable Link
  //   不存在 → disabled badge（caller 端不用更新；callee 被加進 data/ 後連結自動生效）
  target_api_ref: z.string().optional(),
});

const UsesBlock = z.object({
  tables: z.array(z.string()).default([]),
  topics_produced: z.array(z.string()).default([]),
  topics_consumed: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  workers_triggered: z.array(z.string()).default([]).optional(),
  // Cloud Logging sink / structured-log-based event routing (non-Pub/Sub)
  log_sinks_produced: z.array(z.string()).default([]).optional(),
});

// Handler- or service-layer inline auth checks (non-middleware)
const InlineAuthCheck = z.object({
  name: z.string(),
  code_ref: z.string().optional(),
  scope: z.string().optional(), // e.g. "org" / "member" / "channel" / "message"
  note: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Middleware manifest
//
// Middleware 從「API yaml 內的 inline 小物件 / service.yaml 的 string chain」
// 提升為一等 entity：一支 middleware 一個檔。設計原則同 tables / topics /
// integrations — aggregator 反向 index，single source of truth 集中在
// middlewares/<id>.yaml，apis/*.yaml#middlewares[] 只留 id。
// ---------------------------------------------------------------------------

const MiddlewareContextKey = z.object({
  key: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
});

const MiddlewareErrorResponse = z.object({
  status: z.number(),
  error_code: z.string().optional(),
  when: z.string().optional(),
});

const MiddlewareOrderConstraint = z.object({
  must_be_after: z.string().optional(),
  must_be_before: z.string().optional(),
  reason: z.string().optional(),
});

const MiddlewareConfig = z.object({
  env_vars: z.array(z.string()).default([]),
  secret_source: z.string().optional(),
  note: z.string().optional(),
});

export const MiddlewareManifest = z.object({
  id: z.string(),
  kind: z
    .enum([
      "auth",
      "observability",
      "input-validation",
      "rate-limit",
      "error-handling",
      "panic-recovery",
      "request-id",
      "other",
    ])
    .default("other"),
  description: z.string().optional(),
  code_ref: z.string().optional(),
  provided_by: z.string().optional(), // 例："gin-framework"（內建 middleware 無 code_ref）
  config: MiddlewareConfig.optional(),
  reads_context: z.array(MiddlewareContextKey).default([]),
  writes_context: z.array(MiddlewareContextKey).default([]),
  error_responses: z.array(MiddlewareErrorResponse).default([]),
  order_constraints: z.array(MiddlewareOrderConstraint).default([]),
  notes: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Service manifest
// ---------------------------------------------------------------------------

export const ServiceManifest = z.object({
  id: z.string(),
  // GitHub path `<org>/<repo>` — 有值時 CodeRef 會渲染成 clickable GitHub link；
  // local-only repo 留空或省略 → CodeRef 渲染成純文字 path（不可點）。
  repo: z.string().optional(),
  team: z.string(),
  description: z.string(),
  tech: z.array(z.string()),
  components: z.array(z.object({
    id: z.string(),
    binary: z.string(),
    description: z.string(),
  })),
  apis: z.array(EntityRef),
  workers: z.array(EntityRef),
  tables: z.array(EntityRef),
  topics_produced: z.array(EntityRef),
  topics_consumed: z.array(EntityRef),
  integrations: z.array(EntityRef),
  middlewares: z.array(EntityRef).default([]),
  depends_on_infra: z.array(z.string()),
  middleware_pipelines: z.array(MiddlewarePipelineDef).default([]),
  env_config: z.array(EnvConfig).default([]),
  environments: z.array(DeploymentEnv).default([]),
});

// ---------------------------------------------------------------------------
// API manifest
// ---------------------------------------------------------------------------

export const ApiManifest = z.object({
  id: z.string(),
  version: z.string().optional(),
  status: z.enum(["active", "deprecated", "sunset"]).optional(),
  deprecated_in: z.string().optional(),
  replaced_by: z.string().optional(),
  endpoint_type: z.enum(["rest", "webhook", "internal"]).optional(),
  group: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  path: z.string(),
  component: z.string(),
  description: z.string(),
  auth: z.string(),
  code_ref: z.string(),
  openapi_ref: z.string().optional(),
  middleware_pipeline: z.string(),
  middlewares: z.array(MiddlewareUse).default([]),
  inline_auth_checks: z.array(InlineAuthCheck).default([]).optional(),
  request: RequestSchema.optional(),
  response: z.array(ResponseSpec).default([]),
  steps: z.array(Step).default([]),
  uses: UsesBlock,
  sequence_mermaid: z.string(),
});

// ---------------------------------------------------------------------------
// Worker manifest
// ---------------------------------------------------------------------------

const Processor = z.object({
  id: z.string(),
  conversion_type: z.string().optional(),
  code_ref: z.string().optional(),
  status: z.string().optional(),
});

export const WorkerManifest = z.object({
  id: z.string(),
  component: z.string(),
  description: z.string(),
  binary: z.string().optional(),
  code_ref: z.string().optional(),
  kind: z.string().optional(),
  subscribes_topic: z.string().optional(),
  subscription_pattern: z.string().optional(),
  subscription_env: z.string().optional(),
  processors: z.array(Processor).default([]),
  receive_settings: z.record(z.union([z.string(), z.number()])).optional(),
  idempotency: z.object({
    strategy: z.string().optional(),
    rule: z.string().optional(),
    code_ref: z.string().optional(),
  }).optional(),
  ack_semantics: z.object({
    ack_on: z.array(z.string()).default([]),
    nack_on: z.array(z.string()).default([]),
  }).optional(),
  steps: z.array(Step).default([]),
  failure_handling: z.record(z.any()).optional(),
  uses: UsesBlock,
  sequence_mermaid: z.string(),
});

// ---------------------------------------------------------------------------
// Table manifest
// ---------------------------------------------------------------------------

const Column = z.object({
  name: z.string(),
  type: z.string(),
  primary_key: z.boolean().optional(),
  nullable: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const Index = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean().optional(),
  type: z.string().optional(),
});

export const TableManifest = z.object({
  id: z.string(),
  database: z.string(),
  description: z.string().optional(),
  migration_ref: z.string().optional(),
  model_code_ref: z.string().optional(),
  repo_code_ref: z.string().optional(),
  group: z.string().optional(),
  columns: z.array(Column).default([]),
  indexes: z.array(Index).default([]),
  read_by: z.object({
    apis: z.array(z.string()).default([]),
    workers: z.array(z.string()).default([]),
  }).optional(),
  write_by: z.object({
    apis: z.array(z.string()).default([]),
    workers: z.array(z.string()).default([]),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Topic manifest
// ---------------------------------------------------------------------------

const MessageField = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const TopicAttribute = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
});

export const TopicManifest = z.object({
  id: z.string(),
  provider: z.string(),
  gcp_project_pattern: z.string().optional(),
  description: z.string().optional(),
  schema_ref: z.string().optional(),
  publisher_code_ref: z.string().optional(),
  consumer_code_ref: z.string().optional(),
  message_schema: z.object({
    fields: z.array(MessageField).default([]),
  }).optional(),
  attributes: z.array(TopicAttribute).default([]),
  produced_by: z.array(z.record(z.string())).default([]),
  consumed_by: z.array(z.record(z.string())).default([]),
  known_external_consumers: z.array(z.object({
    repo: z.string(),
    note: z.string().optional(),
  })).default([]),
  retry_policy: z.record(z.any()).optional(),
  delivery_guarantee: z.string().optional(),
});

// ---------------------------------------------------------------------------
// External service manifest
// ---------------------------------------------------------------------------

const ExternalOperation = z.object({
  id: z.string(),
  code_ref: z.string().optional(),
  description: z.string().optional(),
});

const ExternalPath = z.object({
  path: z.string(),
  direction: z.string().optional(),
  note: z.string().optional(),
  used_by: z.object({
    apis: z.array(z.string()).default([]),
    workers: z.array(z.string()).default([]),
  }).partial().optional(),
});

const InboundBlock = z.object({
  webhook_endpoints: z.array(z.string()).default([]),
  auth: z.string().optional(),
  signature_header: z.string().optional(),
  verification_env: z.string().optional(),
  note: z.string().optional(),
});

const OutboundOperation = z.object({
  id: z.string(),
  code_ref: z.string().optional(),
  method: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  // failure behavior when this outbound call fails
  failure_semantic: z.enum(["block", "best_effort", "log_only"]).optional(),
});

const OutboundBlock = z.object({
  operations: z.array(OutboundOperation).default([]),
  auth: z.string().optional(),
  auth_env: z.string().optional(),
  rate_limits: z.record(z.any()).optional(),
});

export const IntegrationManifest = z.object({
  id: z.string(),
  kind: z.string(),
  provider: z.string().optional(),
  directions: z
    .array(z.enum(["inbound", "outbound"]))
    .default(["outbound"]),
  inbound: InboundBlock.optional(),
  outbound: OutboundBlock.optional(),
  description: z.string().optional(),
  code_ref: z.string().optional(),
  local_impl: z.string().optional(),
  local_impl_note: z.string().optional(),
  bucket_pattern: z.string().optional(),
  bucket_env: z.string().optional(),
  paths: z.array(ExternalPath).default([]),
  auth: z.string().optional(),
  external_writers: z.array(z.record(z.any())).default([]),
  operations: z.array(ExternalOperation).default([]),
  invocation: z.string().optional(),
  binary_required: z.array(z.string()).default([]),
  used_by: z.object({
    apis: z.array(z.string()).default([]),
    workers: z.array(z.string()).default([]),
  }).partial().optional(),
  docker: z.string().optional(),
  protocol: z.string().optional(),
  method: z.string().optional(),
  url: z.string().optional(),
  notes: z.array(z.string()).default([]),
  security: z.record(z.any()).optional(),
  // cloud-logging-sink kind: routed-sink naming + known events
  sink_name_pattern: z.string().optional(),
  events: z
    .array(
      z.object({
        id: z.string(),
        schema_ref: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .default([])
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Service = z.infer<typeof ServiceManifest>;
export type Api = z.infer<typeof ApiManifest>;
export type Worker = z.infer<typeof WorkerManifest>;
export type Table = z.infer<typeof TableManifest>;
export type Topic = z.infer<typeof TopicManifest>;
export type Integration = z.infer<typeof IntegrationManifest>;
export type Middleware = z.infer<typeof MiddlewareManifest>;

export type EntityKind =
  | "api"
  | "worker"
  | "table"
  | "topic"
  | "integration"
  | "middleware";

export interface Repo {
  service: Service;
  apis: Api[];
  workers: Worker[];
  tables: Table[];
  topics: Topic[];
  integrations: Integration[];
  middlewares: Middleware[];
}
