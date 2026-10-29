import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Reader from '../components/Reader';
import { repo } from '../stores/library';

export default function ReadPage() {
  const { bookId = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState<{ body: string; start?: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const body = await repo.getBody(bookId);
      const q = params.get('line');
      setState({ body, start: q === null ? undefined : Number(q) });
    })();
    // 開いたときの 1 回だけ読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const timer = useRef<number | undefined>(undefined);
  const lineRef = useRef<number | undefined>(undefined);
  const onLine = useCallback(
    (line: number) => {
      lineRef.current = line;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void repo.saveProgress(bookId, line), 500);
    },
    [bookId],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!state) return null;
  return (
    <Reader
      source={state.body}
      startLine={state.start}
      onLine={onLine}
      onClose={() => nav(`/b/${bookId}`)}
      onEdit={() => nav(`/b/${bookId}/edit?line=${lineRef.current ?? state.start ?? 0}`)}
    />
  );
}
