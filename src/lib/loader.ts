import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import {
  ApiManifest,
  IntegrationManifest,
  MiddlewareManifest,
  Repo,
  ServiceManifest,
  TableManifest,
  TopicManifest,
  WorkerManifest,
} from "@/types/manifest";

const DATA_ROOT = path.join(process.cwd(), "data");

async function readYaml(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8");
  return parseYaml(raw);
}

async function loadRepo(repoId: string): Promise<Repo> {
  const repoRoot = path.join(DATA_ROOT, repoId);
  const servicePath = path.join(repoRoot, "service.yaml");
  const service = ServiceManifest.parse(await readYaml(servicePath));

  const resolve = <T>(
    schema: { parse: (input: unknown) => T },
    refs: { id: string; file: string }[],
  ) =>
    Promise.all(
      refs.map(async (ref) => {
        const filePath = path.join(repoRoot, ref.file);
        try {
          return schema.parse(await readYaml(filePath));
        } catch (err) {
          throw new Error(
            `Failed to parse ${repoId}/${ref.file}: ${(err as Error).message}`,
          );
        }
      }),
    );

  const apis = await resolve(ApiManifest, service.apis);
  const workers = await resolve(WorkerManifest, service.workers);
  const tables = await resolve(TableManifest, service.tables);

  const topicRefs = [
    ...service.topics_produced,
    ...service.topics_consumed.filter(
      (t) => !service.topics_produced.some((p) => p.id === t.id),
    ),
  ];
  const topics = await resolve(TopicManifest, topicRefs);

  const integrations = await resolve(
    IntegrationManifest,
    service.integrations,
  );

  // middlewares 是 2026-04 pilot 後新增的 entity；舊 repo（還沒宣告）會走 default []。
  const middlewares = await resolve(
    MiddlewareManifest,
    service.middlewares ?? [],
  );

  return { service, apis, workers, tables, topics, integrations, middlewares };
}

export async function listRepoIds(): Promise<string[]> {
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export async function loadRepos(): Promise<Repo[]> {
  const ids = await listRepoIds();
  return Promise.all(ids.map(loadRepo));
}

export async function getRepo(repoId: string): Promise<Repo | null> {
  const ids = await listRepoIds();
  if (!ids.includes(repoId)) return null;
  return loadRepo(repoId);
}
