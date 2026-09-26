import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageShellProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}

/** Shared chrome for the browse views (task 1): a back link plus a heading. */
export function PageShell({ title, backTo, backLabel, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        {backTo && (
          <Link to={backTo} className="mb-1 block text-sm text-slate-400 hover:text-slate-200">
            &larr; {backLabel ?? "Back"}
          </Link>
        )}
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
