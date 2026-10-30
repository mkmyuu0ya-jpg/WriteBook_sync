import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Reader from '../components/Reader';
import { readPublicGist } from '../lib/sync/github';

type PublicContent = { body: string; updatedAt: string };

export default function PublicReadPage() {
  const { gistId = '' } = useParams();
  const [content, setContent] = useState<PublicContent | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void readPublicGist(gistId).then((gist) => {
      if (active) setContent({ body: gist.content, updatedAt: gist.updatedAt });
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '公開本文を取得できませんでした。');
    });
    return () => {
      active = false;
    };
  }, [gistId]);

  if (error) {
    return <main className="p-6 text-sm text-rose-700 dark:text-rose-300" role="alert">{error}</main>;
  }
  if (!content) return <main className="p-6 text-sm">公開本文を読み込み中…</main>;
  return <Reader source={content.body} proofreading notice={`校正用共有ページ・更新 ${new Date(content.updatedAt).toLocaleString('ja-JP')}`} />;
}
