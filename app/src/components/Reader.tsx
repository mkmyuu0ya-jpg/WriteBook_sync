import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { parse, type Block, type Inline } from '../lib/parser/pixiv';
import { fitFontSize, pageMetrics, spacerSize } from '../lib/reader/layout';
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

/** 閲覧モード：自然スクロールし、[newpage] で次の画面境界へ移動する。 */
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

  const stageRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number | undefined>(startLine);
  const previousVertRef = useRef(vert);

  const reportVisibleLine = useCallback(() => {
    const vp = vpRef.current;
    const tx = txRef.current;
    if (!vp || !tx || !onLine) return;

    const offset = vert ? Math.max(0, -vp.scrollLeft) : Math.max(0, vp.scrollTop);
    const textRect = tx.getBoundingClientRect();
    for (const el of tx.querySelectorAll<HTMLElement>('[data-line]')) {
      if (el.hasAttribute('data-np')) continue;
      const rect = el.getBoundingClientRect();
      const start = vert ? textRect.right - rect.right : rect.top - textRect.top;
      const extent = vert ? rect.width : rect.height;
      if (start + extent > offset + 1) {
        onLine(Number(el.dataset.line));
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
    const currentOffset = previousVertRef.current === vert
      ? vert ? Math.max(0, -vp.scrollLeft) : Math.max(0, vp.scrollTop)
      : 0;

    tx.style.transform = 'none';
    tx.style.position = '';
    tx.style.left = '';
    tx.style.fontSize = displayFs + 'px';
    tx.style.lineHeight = m.L + 'px';
    tx.style.setProperty('--L', m.L + 'px');
    vp.style.width = m.vpW + 'px';
    vp.style.height = m.vpH + 'px';
    vp.style.overflowX = vert ? 'auto' : 'hidden';
    vp.style.overflowY = vert ? 'hidden' : 'auto';

    const axis = vert ? 'width' : 'height';
    const otherAxis = vert ? 'height' : 'width';
    const newPages = tx.querySelectorAll<HTMLElement>('[data-np]');
    newPages.forEach((element) => {
      element.style[axis] = '0px';
      element.style[otherAxis] = '';
    });

    const textRect = tx.getBoundingClientRect();
    newPages.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const offset = vert ? textRect.right - rect.right : rect.top - textRect.top;
      element.style[axis] = `${spacerSize(offset, m.P)}px`;
    });

    let targetOffset = currentOffset;
    if (startRef.current !== undefined) {
      const element = tx.querySelector<HTMLElement>(`[data-line="${startRef.current}"]`);
      if (element && !element.hasAttribute('data-np')) {
        const rect = element.getBoundingClientRect();
        targetOffset = vert ? textRect.right - rect.right : rect.top - textRect.top;
      }
    }
    startRef.current = undefined;
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
    if (vert) vp.scrollLeft = -targetOffset;
    else vp.scrollTop = targetOffset;
    previousVertRef.current = vert;
    requestAnimationFrame(reportVisibleLine);
  }, [vert, fs, reportVisibleLine]);

  useLayoutEffect(() => {
    relayout();
  }, [relayout, blocks]);

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

  return (
    <div className="rd">
      <div className="rd-bar">
        {notice && <span className="text-xs opacity-70">{notice}</span>}
        {onClose && <button onClick={onClose}>戻る</button>}
        {onEdit && <button onClick={onEdit}>加筆</button>}
        <button onClick={() => update({ vert: !vert })}>{vert ? '縦書き' : '横書き'}</button>
        <button onClick={() => update({ fs: Math.max(12, fs - 2) })}>A−</button>
        <button onClick={() => update({ fs: Math.min(36, fs + 2) })}>A＋</button>
        <span className="rd-ind">スクロール</span>
      </div>
      <div className={`rd-stage ${vert ? 'v-scroll' : 'h-scroll'}`} ref={stageRef}>
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
