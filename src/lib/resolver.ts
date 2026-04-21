import { Repo } from "@/types/manifest";

export type EntityKind =
  | "api"
  | "worker"
  | "table"
  | "topic"
  | "integration"
  | "middleware";

export function findApi(repo: Repo, id: string) {
  return repo.apis.find((a) => a.id === id);
}
export function findWorker(repo: Repo, id: string) {
  return repo.workers.find((w) => w.id === id);
}
export function findTable(repo: Repo, id: string) {
  return repo.tables.find((t) => t.id === id);
}
export function findTopic(repo: Repo, id: string) {
  return repo.topics.find((t) => t.id === id);
}
export function findIntegration(repo: Repo, id: string) {
  return repo.integrations.find((e) => e.id === id);
}
export function findMiddleware(repo: Repo, id: string) {
  return repo.middlewares.find((m) => m.id === id);
}

export function findPipeline(repo: Repo, id: string) {
  return repo.service.middleware_pipelines.find((p) => p.id === id);
}

// 反向索引：找出某支 middleware 出現在哪幾條 pipeline（從 service.yaml#middleware_pipelines[].order[] 推）
// 與哪些 API（從 apis/*.yaml#middlewares[].id 推）。
export function middlewareUsers(
  repo: Repo,
  middlewareId: string,
): { pipelines: string[]; apis: string[] } {
  const pipelines = repo.service.middleware_pipelines
    .filter((p) => p.order.includes(middlewareId))
    .map((p) => p.id);
  const apis = repo.apis
    .filter((a) => a.middlewares.some((m) => m.id === middlewareId))
    .map((a) => a.id);
  return { pipelines, apis };
}

export interface ProducerConsumer {
  apis: string[];
  workers: string[];
}

export function topicProducers(repo: Repo, topicId: string): ProducerConsumer {
  const apis = repo.apis
    .filter((a) => a.uses.topics_produced.includes(topicId))
    .map((a) => a.id);
  const workers = repo.workers
    .filter((w) => w.uses.topics_produced.includes(topicId))
    .map((w) => w.id);
  return { apis, workers };
}

export function topicConsumers(repo: Repo, topicId: string): ProducerConsumer {
  const apis = repo.apis
    .filter((a) => a.uses.topics_consumed.includes(topicId))
    .map((a) => a.id);
  const workers = repo.workers
    .filter((w) => w.uses.topics_consumed.includes(topicId))
    .map((w) => w.id);
  return { apis, workers };
}

export function integrationUsers(
  repo: Repo,
  integrationId: string,
): ProducerConsumer {
  const apis = repo.apis
    .filter((a) => a.uses.integrations.includes(integrationId))
    .map((a) => a.id);
  const workers = repo.workers
    .filter((w) => w.uses.integrations.includes(integrationId))
    .map((w) => w.id);
  return { apis, workers };
}
