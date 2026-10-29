import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pages as splitPages, parse, type Block, type Inline } from '../lib/parser/pixiv';
import { fitFontSize, pageMetrics } from '../lib/reader/layout';
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
      return null;
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

function pageForLine(bookPages: Block[][], line: number | undefined): number {
  if (line === undefined) return 0;
  const index = bookPages.findIndex((page) => page.some((block) => block.line >= line));
  return index < 0 ? bookPages.length - 1 : index;
}

/** 閲覧モード：[newpage] 単位でページを切り替え、ページ内は必要に応じてスクロールする。 */
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
  /** スクロール位置に応じた行を知らせる（読書位置の保存用） */
  onLine?: (line: number) => void;
  notice?: string;
}) {
  const { vert, fs, update } = useReaderSettings();
  const blocks = useMemo(() => parse(source), [source]);
  const bookPages = useMemo(() => splitPages(blocks), [blocks]);
  const [pageIndex, setPageIndex] = useState(() => pageForLine(bookPages, startLine));
  const currentPageIndex = Math.min(pageIndex, bookPages.length - 1);
  const currentBlocks = bookPages[currentPageIndex] ?? [];

  const stageRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number | undefined>(startLine);
  const visibleLineRef = useRef<number | undefined>(startLine);
  const previousVertRef = useRef(vert);
  const resetOffsetRef = useRef(false);
  const inputRef = useRef({ source, startLine });

  const reportVisibleLine = useCallback(() => {
    const vp = vpRef.current;
    const tx = txRef.current;
    if (!vp || !tx) return;

    const offset = vert ? Math.max(0, -vp.scrollLeft) : Math.max(0, vp.scrollTop);
    const textRect = tx.getBoundingClientRect();
    for (const el of tx.querySelectorAll<HTMLElement>('[data-line]')) {
      const rect = el.getBoundingClientRect();
      const start = vert ? textRect.right - rect.right : rect.top - textRect.top;
      const extent = vert ? rect.width : rect.height;
      if (start + extent > offset + 1) {
        const line = Number(el.dataset.line);
        visibleLineRef.current = line;
        onLine?.(line);
        return;
      }
    }
  }, [vert, onLine]);

  const relayout = useCallback(() => {
    const stage = stageRef.current;
    const vp = vpRef.current;
    const tx = txRef.current;
    if (!stage || !vp || !tx) return;

    const aw = Math.max(1, stage.clientWidth - 16);
    const ah = Math.max(1, stage.clientHeight - 16);
    const displayFs = fitFontSize({ vert, fs, aw, ah });
    const m = pageMetrics({ vert, fs: displayFs, aw, ah });
    const currentOffset = !resetOffsetRef.current && previousVertRef.current === vert
      ? vert ? Math.max(0, -vp.scrollLeft) : Math.max(0, vp.scrollTop)
      : 0;

    tx.style.fontSize = displayFs + 'px';
    tx.style.lineHeight = m.L + 'px';
    tx.style.setProperty('--L', m.L + 'px');
    vp.style.width = m.vpW + 'px';
    vp.style.height = m.vpH + 'px';
    vp.style.overflowX = vert ? 'auto' : 'hidden';
    vp.style.overflowY = vert ? 'hidden' : 'auto';

    const textRect = tx.getBoundingClientRect();
    let targetOffset = currentOffset;
    if (startRef.current !== undefined) {
      const element = tx.querySelector<HTMLElement>(`[data-line="${startRef.current}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        targetOffset = vert ? textRect.right - rect.right : rect.top - textRect.top;
      }
    }
    startRef.current = undefined;
    resetOffsetRef.current = false;
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
    if (vert) vp.scrollLeft = -targetOffset;
    else vp.scrollTop = targetOffset;
    previousVertRef.current = vert;
    requestAnimationFrame(reportVisibleLine);
  }, [vert, fs, reportVisibleLine]);

  useLayoutEffect(() => {
    relayout();
  }, [relayout, currentBlocks]);

  useEffect(() => {
    if (inputRef.current.source === source && inputRef.current.startLine === startLine) return;
    inputRef.current = { source, startLine };
    startRef.current = startLine;
    resetOffsetRef.current = true;
    setPageIndex(pageForLine(bookPages, startLine));
  }, [bookPages, source, startLine]);

  useEffect(() => {
    const stage = stageRef.current;
    const vp = vpRef.current;
    if (!stage || !vp) return;
    const observer = new ResizeObserver(relayout);
    observer.observe(stage);
    const viewport = window.visualViewport;
    window.addEventListener('resize', relayout);
    viewport?.addEventListener('resize', relayout);
    vp.addEventListener('scroll', reportVisibleLine, { passive: true });
    void document.fonts?.ready.then(relayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', relayout);
      viewport?.removeEventListener('resize', relayout);
      vp.removeEventListener('scroll', reportVisibleLine);
    };
  }, [relayout, reportVisibleLine]);

  const goToPage = useCallback((requestedPage: number) => {
    const nextPage = Math.max(0, Math.min(bookPages.length - 1, requestedPage));
    if (nextPage === currentPageIndex) return;
    startRef.current = undefined;
    resetOffsetRef.current = true;
    setPageIndex(nextPage);
  }, [bookPages.length, currentPageIndex]);

  const turnFromTap = (clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const nextHalf = vert
      ? clientX < bounds.left + bounds.width / 2
      : clientX >= bounds.left + bounds.width / 2;
    goToPage(currentPageIndex + (nextHalf ? 1 : -1));
  };

  return (
    <div className="rd">
      <div className="rd-bar">
        {notice && <span className="text-xs opacity-70">{notice}</span>}
        {onClose && <button onClick={onClose}>戻る</button>}
        {onEdit && <button onClick={onEdit}>加筆</button>}
        <button onClick={() => {
          startRef.current = visibleLineRef.current;
          resetOffsetRef.current = true;
          update({ vert: !vert });
        }}>{vert ? '縦書き' : '横書き'}</button>
        <button onClick={() => update({ fs: Math.max(12, fs - 2) })}>A−</button>
        <button onClick={() => update({ fs: Math.min(36, fs + 2) })}>A＋</button>
        <button onClick={() => goToPage(currentPageIndex - 1)} disabled={currentPageIndex === 0}>前</button>
        <button onClick={() => goToPage(currentPageIndex + 1)} disabled={currentPageIndex >= bookPages.length - 1}>次</button>
        <span className="rd-ind" aria-live="polite">{currentPageIndex + 1} / {bookPages.length} ページ</span>
      </div>
      <div
        className={`rd-stage ${vert ? 'v-scroll' : 'h-scroll'}`}
        ref={stageRef}
        role="region"
        aria-label={`閲覧ページ ${currentPageIndex + 1} / ${bookPages.length}`}
        tabIndex={0}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('button')) return;
          turnFromTap(event.clientX);
        }}
        onKeyDown={(event) => {
          const nextKey = vert ? 'ArrowLeft' : 'ArrowRight';
          const previousKey = vert ? 'ArrowRight' : 'ArrowLeft';
          if (event.key === nextKey || event.key === ' ') {
            event.preventDefault();
            goToPage(currentPageIndex + 1);
          } else if (event.key === previousKey) {
            event.preventDefault();
            goToPage(currentPageIndex - 1);
          }
        }}
      >
        <div className={`rd-vp ${vert ? 'v' : 'h'}`} ref={vpRef}>
          <div className="rd-tx" ref={txRef}>
            {currentBlocks.map((b) => (
              <BlockView key={b.line} b={b} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
