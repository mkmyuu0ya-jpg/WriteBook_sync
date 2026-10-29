import { STATUS_LABEL, type Status } from '../lib/data/types';

const COLOR: Record<Status, string> = {
  wip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  ready: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
};

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR[status]}`}>{STATUS_LABEL[status]}</span>;
}
