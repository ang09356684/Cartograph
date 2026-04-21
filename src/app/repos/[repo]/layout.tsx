import { notFound } from "next/navigation";
import { getRepo } from "@/lib/loader";
import { buildSidebar } from "@/lib/sidebar";
import { RepoSidebarShell } from "@/components/RepoSidebarShell";

export default async function RepoLayout({
  params,
  children,
}: {
  params: { repo: string };
  children: React.ReactNode;
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const sections = buildSidebar(repo);

  // NOTE: flex 預設 align-items=stretch，讓 <aside> 拉到 main content 的高度，
  // 底下 `sticky top-4` 才有足夠的可滾動範圍；若改 items-start，aside 會縮成
  // sidebar 自己高度，頁面一滾 sidebar 就跟著消失。
  return (
    <div className="flex gap-6">
      <aside className="flex-shrink-0">
        <RepoSidebarShell repoId={repo.service.id} sections={sections} />
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
