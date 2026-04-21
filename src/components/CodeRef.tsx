export function CodeRef({
  value,
  repo,
  className = "",
}: {
  value?: string;
  repo?: string;
  className?: string;
}) {
  if (!value) return null;
  const [filePath, symbol] = value.split("#");
  const href = repo
    ? `https://github.com/${repo}/blob/main/${filePath}`
    : undefined;
  const display = symbol ? (
    <>
      <span className="text-slate-500">{filePath}</span>
      <span className="text-slate-400">#</span>
      <span className="text-slate-900">{symbol}</span>
    </>
  ) : (
    <span className="text-slate-900">{filePath}</span>
  );

  const classes = `inline-block font-mono text-[12px] rounded bg-slate-100 px-1.5 py-0.5 no-underline hover:no-underline ${className}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={classes + " hover:bg-slate-200"}
      >
        {display}
      </a>
    );
  }
  return <code className={classes}>{display}</code>;
}
