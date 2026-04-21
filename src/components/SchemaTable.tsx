import { Table } from "@/types/manifest";

export function SchemaTable({ columns }: { columns: Table["columns"] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">Column</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-left px-3 py-2">Null</th>
            <th className="text-left px-3 py-2">Default</th>
            <th className="text-left px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {columns.map((c) => (
            <tr key={c.name}>
              <td className="px-3 py-2 font-mono text-xs">
                {c.name}
                {c.primary_key && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide px-1 rounded bg-amber-50 text-amber-700 border border-amber-100">
                    PK
                  </span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-700">
                {c.type}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {c.nullable === false
                  ? "NO"
                  : c.nullable === true
                  ? "YES"
                  : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">
                {c.default !== undefined ? String(c.default) : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-700">
                {c.description}
                {c.enum && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.enum.map((v) => (
                      <span
                        key={v}
                        className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
