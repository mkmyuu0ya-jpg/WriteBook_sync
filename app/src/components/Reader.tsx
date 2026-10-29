import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parse, type Block, type Inline } from '../lib/parser/pixiv';
import { fitFontSize, pageCount, pageMetrics, pageTransform, spacerSize } from '../lib/reader/layout';
import { useReaderSettings } from '../stores/readerSettings';
import './reader.css';

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((x, i) =>
        x.t === 'ruby' ? (
          <ruby key={i}>
            {x.base}
            <rt>{x.rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{x.s}</span>
        ),
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'chapter':
      return <h2 data-line={b.line}>{b.title}</h2>;
    case 'newpage':
      return <div className="np" data-np="" data-line={b.line} />;
    case 'blank':
      return <p data-line={b.line}>{'\u00a0'}</p>;
    case 'para':
      return (
        <p className={b.quote ? 'q' : undefined} data-line={b.line}>
          <Inlines items={b.inlines} />
        </p>
      );
  }
}

/** 閲覧モード：縦書き／横書き、ページ送り／スクロールを切り替えられる。 */
export default function Reader({
  source,
  startLine,
  onClose,
  onEdit,
  onLine,
  notice,
}: {
  source: string;
  /** 開いたときに表示する行（読書位置・目次からの移動） */
  startLine?: number;
  onClose?: () => void;
  /** 「加筆」ボタン（加筆修正モードへ） */
  onEdit?: () => void;
  /** ページが変わるたびに、先頭に見えている行を知らせる（読書位置の保存用） */
  onLine?: (line: number) => void;
  notice?: string;
}) {
  const { vert, paged, fs, update } = useReaderSettings();
  const blocks = useMemo(() => parse(source), [source]);

  const stageRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [info, setInfo] = useState({ n: 1, P: 1 });
  const pageRef = useRef(0);
  const nRef = useRef(1);
  const startRef = useRef<number | undefined>(startLine);
  pageRef.current = page;
  nRef.current = info.n;

  const relayout = useCallback(() => {
    const stage = stageRef.current;
    const vp = vpRef.current;
    const tx = txRef.current;
    if (!stage || !vp || !tx) return;
    const aw = Math.max(1, stage.clientWidth - 16);
    const ah = Math.max(1, stage.clientHeight - 16);
    const displayFs = fitFontSize({ vert, fs, aw, ah });
    const m = pageMetrics({ vert, paged, fs: displayFs, aw, ah });
    tx.style.transform = 'none';
    tx.style.fontSize = displayFs + 'px';
    tx.style.lineHeight = m.L + 'px';
    tx.style.setProperty('--L', m.L + 'px');
    vp.style.width = m.vpW + 'px';
    vp.style.height = m.vpH + 'px';
    vp.style.overflowX = vert && !paged ? 'auto' : 'hidden';
    vp.style.overflowY = !vert && !paged ? 'auto' : 'hidden';

    // [newpage]：ページ送りでは次のページ境界まで空白で埋める。スクロールでは 1 行ぶんの間隔にする。
    const ax = vert ? 'width' : 'height';
    const ox = vert ? 'height' : 'width';
    const nps = tx.querySelectorAll<HTMLElement>('[data-np]');
    nps.forEach((n) => {
      n.style[ox] = '';
      n.style[ax] = paged ? '0px' : m.L + 'px';
    });
    if (paged) {
      const t = tx.getBoundingClientRect();
      nps.forEach((n) => {
        const r = n.getBoundingClientRect();
        const off = vert ? t.right - r.right : r.top - t.top;
        const s = spacerSize(off, m.P);
        if (s > 0) n.style[ax] = s + 'px';
      });
    }

    vp.scrollLeft = 0;
    vp.scrollTop = 0;
    const total = vert ? vp.scrollWidth : vp.scrollHeight;
    const n = paged ? pageCount(total, m.P) : 1;
    const f = nRef.current > 0 ? pageRef.current / nRef.current : 0;
    let target: number | null = null;
    if (paged && startRef.current !== undefined) {
      const el = tx.querySelector<HTMLElement>(`[data-line="${startRef.current}"]`);
      if (el) {
        const t = tx.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const off = vert ? t.right - r.right : r.top - t.top;
        target = Math.min(n - 1, Math.max(0, Math.floor((off + 1) / m.P)));
      }
    }
    startRef.current = undefined;
    setInfo({ n, P: m.P });
    setPage(target ?? Math.min(n - 1, Math.floor(f * n)));
  }, [vert, paged, fs]);

  useLayoutEffect(() => {
    relayout();
  }, [relayout, blocks]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    const viewport = window.visualViewport;
    const onViewportResize = () => relayout();
    window.addEventListener('resize', onViewportResize);
    viewport?.addEventListener('resize', onViewportResize);
    void document.fonts?.ready.then(relayout);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onViewportResize);
      viewport?.removeEventListener('resize', onViewportResize);
    };
  }, [relayout]);

  useLayoutEffect(() => {
    if (txRef.current) txRef.current.style.transform = pageTransform(page, info.P, vert, paged);
  }, [page, info, vert, paged]);

  useEffect(() => {
    if (!paged || !onLine) return;
    const tx = txRef.current;
    if (!tx) return;
    const t = tx.getBoundingClientRect();
    const start = page * info.P;
    for (const el of tx.querySelectorAll<HTMLElement>('[data-line]')) {
      if (el.hasAttribute('data-np')) continue;
      const r = el.getBoundingClientRect();
      const off = vert ? t.right - r.right : r.top - t.top;
      if (off >= start - 1) {
        onLine(Number(el.dataset.line));
        return;
      }
    }
  }, [page, info, vert, paged, onLine]);

  const go = useCallback((p: number) => setPage(Math.max(0, Math.min(info.n - 1, p))), [info.n]);
  const next = useCallback(() => go(page + 1), [go, page]);
  const prev = useCallback(() => go(page - 1), [go, page]);

  useEffect(() => {
    if (!paged) return;
    const onKey = (e: KeyboardEvent) => {
      const nx = vert ? 'ArrowLeft' : 'ArrowRight';
      const pv = vert ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === nx || e.key === ' ') next();
      else if (e.key === pv) prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paged, vert, next, prev]);

  const sx = useRef(0);
  const swiped = useRef(false);

  return (
    <div className="rd">
      <div className="rd-bar">
        {notice && <span className="text-xs opacity-70">{notice}</span>}
        {onClose && <button onClick={onClose}>戻る</button>}
        {onEdit && <button onClick={onEdit}>加筆</button>}
        <button onClick={() => update({ vert: !vert })}>{vert ? '縦書き' : '横書き'}</button>
        <button onClick={() => update({ paged: !paged })}>{paged ? 'ページ送り' : 'スクロール'}</button>
        <button onClick={() => update({ fs: Math.max(12, fs - 2) })}>A−</button>
        <button onClick={() => update({ fs: Math.min(36, fs + 2) })}>A＋</button>
        {paged && (
          <>
            <button onClick={prev}>前</button>
            <button onClick={next}>次</button>
          </>
        )}
        <span className="rd-ind" data-testid="indicator">
          {paged ? `${page + 1} / ${info.n} ページ` : '連続スクロール'}
        </span>
      </div>
      <div
        className="rd-stage"
        ref={stageRef}
        onTouchStart={(e) => {
          sx.current = e.touches[0].clientX;
          swiped.current = false;
        }}
        onTouchEnd={(e) => {
          if (!paged) return;
          const dx = e.changedTouches[0].clientX - sx.current;
          if (Math.abs(dx) > 40) {
            swiped.current = true;
            if (vert ? dx > 0 : dx < 0) next();
            else prev();
          }
        }}
        onClick={(e) => {
          if (!paged || swiped.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          if (vert ? x < 0.5 : x > 0.5) next();
          else prev();
        }}
      >
        <div className={`rd-vp ${vert ? 'v' : 'h'}`} ref={vpRef}>
          <div className="rd-tx" ref={txRef}>
            {blocks.map((b) => (
              <BlockView key={b.line} b={b} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
