import Link from "next/link";

export interface EntityCardProps {
  href: string;
  title: string;
  subtitle?: string;
  description?: string;
  badges?: string[];
}

export function EntityCard({
  href,
  title,
  subtitle,
  description,
  badges,
}: EntityCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-sky-400 transition no-underline hover:no-underline"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && (
          <span className="font-mono text-xs text-slate-500 truncate">
            {subtitle}
          </span>
        )}
      </div>
      {description && (
        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{description}</p>
      )}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {badges.map((b) => (
            <span
              key={b}
              className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function SectionHeading({
  title,
  href,
  count,
}: {
  title: string;
  href?: string;
  count?: number;
}) {
  const content = (
    <span className="flex items-baseline gap-2">
      <span>{title}</span>
      {typeof count === "number" && (
        <span className="text-sm text-slate-500 font-normal">({count})</span>
      )}
    </span>
  );
  return (
    <h2 className="text-lg font-semibold text-slate-900 mb-3 mt-6 first:mt-0">
      {href ? (
        <Link href={href} className="no-underline hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </h2>
  );
}
