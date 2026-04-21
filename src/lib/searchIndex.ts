import "server-only";
import { loadRepos } from "@/lib/loader";
import {
  apiPath,
  integrationPath,
  middlewarePath,
  repoPath,
  tablePath,
  topicPath,
  workerPath,
} from "@/lib/paths";

export type SearchEntryType =
  | "repo"
  | "api"
  | "worker"
  | "table"
  | "topic"
  | "integration"
  | "middleware";

export interface SearchEntry {
  type: SearchEntryType;
  repo: string;
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  href: string;
}

export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const repos = await loadRepos();
  const out: SearchEntry[] = [];

  for (const r of repos) {
    const repoId = r.service.id;
    out.push({
      type: "repo",
      repo: repoId,
      id: repoId,
      title: repoId,
      subtitle: r.service.repo,
      description: r.service.description,
      href: repoPath(repoId),
    });
    r.apis.forEach((a) =>
      out.push({
        type: "api",
        repo: repoId,
        id: a.id,
        title: a.id,
        subtitle: `${a.method} ${a.path}`,
        description: a.description,
        href: apiPath(repoId, a.id),
      }),
    );
    r.workers.forEach((w) =>
      out.push({
        type: "worker",
        repo: repoId,
        id: w.id,
        title: w.id,
        subtitle: w.subscribes_topic,
        description: w.description,
        href: workerPath(repoId, w.id),
      }),
    );
    r.tables.forEach((t) =>
      out.push({
        type: "table",
        repo: repoId,
        id: t.id,
        title: t.id,
        subtitle: t.database,
        description: t.description,
        href: tablePath(repoId, t.id),
      }),
    );
    r.topics.forEach((t) =>
      out.push({
        type: "topic",
        repo: repoId,
        id: t.id,
        title: t.id,
        subtitle: t.provider,
        description: t.description,
        href: topicPath(repoId, t.id),
      }),
    );
    r.integrations.forEach((e) =>
      out.push({
        type: "integration",
        repo: repoId,
        id: e.id,
        title: e.id,
        subtitle: `${e.kind}${e.provider ? ` · ${e.provider}` : ""}`,
        description: e.description,
        href: integrationPath(repoId, e.id),
      }),
    );
    r.middlewares.forEach((m) =>
      out.push({
        type: "middleware",
        repo: repoId,
        id: m.id,
        title: m.id,
        subtitle: m.kind,
        description: m.description,
        href: middlewarePath(repoId, m.id),
      }),
    );
  }
  return out;
}
