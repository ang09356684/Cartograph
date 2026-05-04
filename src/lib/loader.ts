import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import {
  Api,
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

// Process-level cache. Next.js build is one Node process, so memoizing here
// lets all SSG routes share a single yaml read + Zod parse pass.
let cachedIds: Promise<string[]> | null = null;
const repoCache = new Map<string, Promise<Repo>>();

export async function listRepoIds(): Promise<string[]> {
  if (!cachedIds) {
    cachedIds = (async () => {
      const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    })();
  }
  return cachedIds;
}

function loadRepoCached(repoId: string): Promise<Repo> {
  let p = repoCache.get(repoId);
  if (!p) {
    p = loadRepo(repoId);
    repoCache.set(repoId, p);
  }
  return p;
}

export async function loadRepos(): Promise<Repo[]> {
  const ids = await listRepoIds();
  return Promise.all(ids.map(loadRepoCached));
}

export async function getRepo(repoId: string): Promise<Repo | null> {
  const ids = await listRepoIds();
  if (!ids.includes(repoId)) return null;
  return loadRepoCached(repoId);
}

// 以 base id 聚合同一個 API 的多個 version。
// 回傳 Map<id, Api[]>；每個 list 已按 version 由新到舊排序（無 version 視為最舊）。
export function groupApisByBaseId(apis: Api[]): Map<string, Api[]> {
  const byId = new Map<string, Api[]>();
  for (const api of apis) {
    const list = byId.get(api.id) ?? [];
    list.push(api);
    byId.set(api.id, list);
  }
  for (const list of byId.values()) list.sort(compareApiByVersionDesc);
  return byId;
}

function compareApiByVersionDesc(a: Api, b: Api): number {
  return versionRank(b.version) - versionRank(a.version);
}

function versionRank(v?: string): number {
  if (!v) return 0;
  const m = /^v(\d+)$/.exec(v);
  return m ? Number(m[1]) : 0;
}

// 從同一 base id 的版本 list 和 query param 選出要顯示的那一支。
// 缺省或查無對應時回傳最新版（list[0]）。
export function pickApiVersion(versions: Api[], requested?: string): Api {
  if (requested) {
    const hit = versions.find((v) => v.version === requested);
    if (hit) return hit;
  }
  return versions[0];
}
