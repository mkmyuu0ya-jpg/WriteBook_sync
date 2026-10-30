import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor, { type EditorHandle } from '../components/Editor';
import { repo } from '../stores/library';

type Save = 'saved' | 'dirty' | 'saving';
const LABEL: Record<Save, string> = { saved: '保存済み', dirty: '未保存', saving: '保存中…' };

/** 加筆修正モード。変更は 1 秒で端末内に保存する（GitHub への同期は Phase 2）。 */
export default function EditPage() {
  const { bookId = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [init, setInit] = useState<{ body: string; start?: number } | null>(null);
  const [save, setSave] = useState<Save>('saved');
  const [note, setNote] = useState('');
  const [lineInput, setLineInput] = useState('1');
  const editor = useRef<EditorHandle>(null);
  const editorScreen = useRef<HTMLDivElement>(null);
  const latest = useRef('');
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const body = await repo.getBody(bookId);
      // 編集を始める前の状態を残す（誤って消したときに戻せるように）
      await repo.addSnapshot(bookId, body, 'edit-start');
      latest.current = body;
      const q = params.get('line');
      setInit({ body, start: q === null ? undefined : Number(q) });
      setLineInput(String((q === null ? 0 : Number(q)) + 1));
    })();
    // 開いたときの 1 回だけ読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    if (!init) return;
    const screen = editorScreen.current;
    if (!screen) return;

    const viewport = window.visualViewport;
    let previousHeight = 0;
    const updateHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      if (Math.abs(height - previousHeight) < 1) return;
      previousHeight = height;
      screen.style.setProperty('--editor-viewport-height', `${height}px`);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    viewport?.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      viewport?.removeEventListener('resize', updateHeight);
      screen.style.removeProperty('--editor-viewport-height');
    };
  }, [init]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setSave('saving');
    await repo.setBody(bookId, latest.current);
    setSave(dirty.current ? 'dirty' : 'saved');
  }, [bookId]);

  const onChange = useCallback(
    (text: string) => {
      latest.current = text;
      dirty.current = true;
      setSave('dirty');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 1000);
    },
    [flush],
  );

  const jumpToLine = () => {
    const requestedLine = Number(lineInput);
    const totalLines = latest.current.split(/\r?\n/).length;
    if (!Number.isInteger(requestedLine) || requestedLine < 1 || requestedLine > totalLines) {
      setNote(`1〜${totalLines}の行番号を入力してください`);
      return;
    }
    const targetLine = editor.current?.jumpToLine(requestedLine);
    if (targetLine !== undefined) {
      setLineInput(String(targetLine));
      setNote(`${targetLine}行目へ移動しました`);
    }
  };

  // 画面を離れる・隠れるときにも保存する
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => void flush());
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  if (!init) return null;
  const btn = (label: string, run: () => void) => (
    <button onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  return (
    <div className="ed" ref={editorScreen}>
      <div className="ed-bar">
        <button
          onClick={async () => {
            const line = editor.current?.cursorLine() ?? 0;
            await flush();
            window.dispatchEvent(new Event('book-sync-now'));
            nav(`/b/${bookId}/read?line=${line}`);
          }}
        >
          編集を終える
        </button>
        {btn('見出し', () => editor.current?.chapter())}
        {btn('改ページ', () => editor.current?.newpage())}
        {btn('ルビ', () => editor.current?.ruby())}
        {btn('太字', () => editor.current?.bold())}
        {btn('斜体', () => editor.current?.italic())}
        {btn('傍点', () => editor.current?.emphasis())}
        {btn('挿絵', () => editor.current?.pixivImage())}
        {btn('アップロード挿絵', () => editor.current?.uploadedImage())}
        {btn('ページリンク', () => editor.current?.pageLink())}
        {btn('URLリンク', () => editor.current?.urlLink())}
        {btn('元に戻す', () => editor.current?.undo())}
        {btn('やり直し', () => editor.current?.redo())}
        <form
          className="ed-line-jump"
          onSubmit={(event) => {
            event.preventDefault();
            jumpToLine();
          }}
        >
          <label htmlFor="ed-line-input">行</label>
          <input
            id="ed-line-input"
            type="number"
            min="1"
            max={latest.current.split(/\r?\n/).length}
            inputMode="numeric"
            value={lineInput}
            onChange={(event) => setLineInput(event.target.value)}
            aria-label="移動先の本文行"
          />
          <button type="submit" onMouseDown={(event) => event.preventDefault()}>移動</button>
        </form>
        {btn('本文をコピー', async () => {
          await navigator.clipboard.writeText(latest.current);
          setNote('コピーしました');
          window.setTimeout(() => setNote(''), 2000);
        })}
        <span className="ed-state" data-testid="save-state">
          {note || LABEL[save]}
        </span>
      </div>
      <Editor ref={editor} initial={init.body} startLine={init.start} onChange={onChange} />
    </div>
  );
}
