import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** 本棚まわりの画面の共通の枠。 */
export default function Shell({ title, back, children }: { title: string; back?: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-xl p-4">
        {back && (
          <Link to={back.to} className="text-sm text-sky-700 dark:text-sky-300">
            ← {back.label}
          </Link>
        )}
        <h1 className="mt-1 text-xl font-bold">{title}</h1>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
