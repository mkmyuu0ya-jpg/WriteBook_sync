import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import {
  boldEdit,
  chapterEdit,
  emphasisEdit,
  italicEdit,
  newpageEdit,
  pageLinkEdit,
  pixivImageEdit,
  rubyEdit,
  uploadedImageEdit,
  urlLinkEdit,
  type Edit,
} from '../lib/editor/notation';
import './editor.css';

/** 記法（見出し・改ページ・ルビ）を色分けして、範囲が分かるようにする。 */
const tags = new MatchDecorator({
  regexp: /\[\[rb:[^\]\n]*\]\]|\[\[emphasismark:[^\]\n]*\]\]|\[\[jumpuri:[^\]\n]*\]\]|\[chapter:[^\]\n]*\]|\[newpage\]|\[(?:b|i):[^\]\n]*\]|\[(?:jump|pixivimage|uploadedimage):[^\]\n]*\]/g,
  decoration: (m) => {
    const tag = m[0];
    const className = tag.startsWith('[[rb')
      ? 'tag-ruby'
      : tag.startsWith('[[emphasismark')
        ? 'tag-emphasis'
        : tag.startsWith('[[jumpuri') || tag.startsWith('[jump:')
          ? 'tag-link'
          : tag.startsWith('[chapter')
            ? 'tag-chapter'
            : tag === '[newpage]'
              ? 'tag-newpage'
              : tag.startsWith('[pixivimage:') || tag.startsWith('[uploadedimage:')
                ? 'tag-image'
                : 'tag-format';
    return Decoration.mark({ class: className });
  },
});
const tagPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = tags.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = tags.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

export type EditorHandle = {
  chapter: () => void;
  newpage: () => void;
  ruby: () => void;
  bold: () => void;
  italic: () => void;
  emphasis: () => void;
  pixivImage: () => void;
  uploadedImage: () => void;
  pageLink: () => void;
  urlLink: () => void;
  undo: () => void;
  redo: () => void;
  /** カーソルのある行（0 始まり） */
  cursorLine: () => number;
  /** 1 始まりの本文行へ移動し、実際に移動した行を返す */
  jumpToLine: (line: number) => number;
  focus: () => void;
};

type Props = {
  initial: string;
  vertical: boolean;
  /** 開いたときにカーソルを置く行（0 始まり） */
  startLine?: number;
  onChange: (text: string) => void;
};

/** 加筆修正モードのエディタ（CodeMirror 6）。 */
const Editor = forwardRef<EditorHandle, Props>(function Editor({ initial, startLine, onChange, vertical }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const verticalInputRef = useRef<HTMLTextAreaElement>(null);
  const previousVerticalRef = useRef(vertical);
  const verticalUndoRef = useRef<string[]>([]);
  const verticalRedoRef = useRef<string[]>([]);
  const [verticalText, setVerticalText] = useState(initial);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const verticalRef = useRef(vertical);
  verticalRef.current = vertical;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({
      doc: initial,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        tagPlugin,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    if (startLine !== undefined) {
      const ln = Math.min(Math.max(startLine + 1, 1), view.state.doc.lines);
      const pos = view.state.doc.line(ln).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 開いたときの内容で 1 回だけ作る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (previousVerticalRef.current === vertical) return;
    const view = viewRef.current;
    const textarea = verticalInputRef.current;
    if (!view || !textarea) return;

    if (vertical) {
      const { head, anchor } = view.state.selection.main;
      const text = view.state.doc.toString();
      setVerticalText(text);
      verticalUndoRef.current = [];
      verticalRedoRef.current = [];
      previousVerticalRef.current = true;
      requestAnimationFrame(() => {
        textarea.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head), anchor <= head ? 'forward' : 'backward');
        textarea.focus();
      });
      return;
    }

    const { selectionStart, selectionEnd, selectionDirection } = textarea;
    const text = textarea.value;
    const oldText = view.state.doc.toString();
    let prefix = 0;
    while (prefix < oldText.length && prefix < text.length && oldText[prefix] === text[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldText.length - prefix
      && suffix < text.length - prefix
      && oldText[oldText.length - 1 - suffix] === text[text.length - 1 - suffix]
    ) suffix += 1;
    view.dispatch({
      changes: {
        from: prefix,
        to: oldText.length - suffix,
        insert: text.slice(prefix, text.length - suffix),
      },
      selection: {
        anchor: selectionDirection === 'backward' ? selectionEnd : selectionStart,
        head: selectionDirection === 'backward' ? selectionStart : selectionEnd,
      },
    });
    previousVerticalRef.current = false;
    view.focus();
  }, [vertical]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const position = view.state.selection.main.head;
    const frame = requestAnimationFrame(() => {
      view.requestMeasure();
      view.dispatch({
        effects: EditorView.scrollIntoView(position, {
          x: vertical ? 'start' : 'nearest',
          y: vertical ? 'nearest' : 'start',
        }),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [vertical]);

  useImperativeHandle(ref, () => {
    const updateVerticalText = (nextText: string, selectionStart: number, selectionEnd = selectionStart) => {
      verticalUndoRef.current = [...verticalUndoRef.current, verticalText].slice(-200);
      verticalRedoRef.current = [];
      setVerticalText(nextText);
      onChangeRef.current(nextText);
      requestAnimationFrame(() => {
        const textarea = verticalInputRef.current;
        if (!textarea) return;
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.focus();
      });
    };
    const apply = (make: (t: string, f: number, to: number) => Edit) => {
      if (verticalRef.current) {
        const textarea = verticalInputRef.current;
        if (!textarea) return;
        const e = make(verticalText, textarea.selectionStart, textarea.selectionEnd);
        const nextText = verticalText.slice(0, e.from) + e.insert + verticalText.slice(e.to);
        updateVerticalText(nextText, e.caret[0], e.caret[1]);
        return;
      }
      const v = viewRef.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const e = make(v.state.doc.toString(), from, to);
      v.dispatch({
        changes: { from: e.from, to: e.to, insert: e.insert },
        selection: { anchor: e.caret[0], head: e.caret[1] },
        effects: EditorView.scrollIntoView(e.caret[1], {
          x: verticalRef.current ? 'start' : 'nearest',
          y: verticalRef.current ? 'nearest' : 'start',
        }),
      });
      v.focus();
    };
    return {
      chapter: () => apply(chapterEdit),
      newpage: () => apply(newpageEdit),
      ruby: () => apply(rubyEdit),
      bold: () => apply(boldEdit),
      italic: () => apply(italicEdit),
      emphasis: () => apply(emphasisEdit),
      pixivImage: () => apply(pixivImageEdit),
      uploadedImage: () => apply(uploadedImageEdit),
      pageLink: () => apply(pageLinkEdit),
      urlLink: () => apply(urlLinkEdit),
      undo: () => {
        if (!verticalRef.current) return viewRef.current && undo(viewRef.current);
        const previous = verticalUndoRef.current.pop();
        if (previous === undefined) return;
        verticalRedoRef.current.push(verticalText);
        setVerticalText(previous);
        onChangeRef.current(previous);
      },
      redo: () => {
        if (!verticalRef.current) return viewRef.current && redo(viewRef.current);
        const next = verticalRedoRef.current.pop();
        if (next === undefined) return;
        verticalUndoRef.current.push(verticalText);
        setVerticalText(next);
        onChangeRef.current(next);
      },
      cursorLine: () => {
        if (verticalRef.current) {
          const textarea = verticalInputRef.current;
          return textarea ? verticalText.slice(0, textarea.selectionStart).split(/\r?\n/).length - 1 : 0;
        }
        const v = viewRef.current;
        return v ? v.state.doc.lineAt(v.state.selection.main.head).number - 1 : 0;
      },
      jumpToLine: (line: number) => {
        if (verticalRef.current) {
          const textarea = verticalInputRef.current;
          if (!textarea) return 1;
          const lines = verticalText.split(/\r?\n/);
          const targetLine = Math.min(Math.max(Math.trunc(line), 1), lines.length);
          const pos = lines.slice(0, targetLine - 1).reduce((sum, item) => sum + item.length + 1, 0);
          textarea.setSelectionRange(pos, pos);
          textarea.focus();
          return targetLine;
        }
        const v = viewRef.current;
        if (!v) return 1;
        const targetLine = Math.min(Math.max(Math.trunc(line), 1), v.state.doc.lines);
        const pos = v.state.doc.line(targetLine).from;
        v.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, {
            x: verticalRef.current ? 'start' : 'nearest',
            y: verticalRef.current ? 'nearest' : 'start',
          }),
        });
        return targetLine;
      },
      focus: () => viewRef.current?.focus(),
    };
  }, [verticalText]);

  return (
    <div className={`ed-host${vertical ? ' ed-host-vertical' : ''}`} ref={hostRef}>
      <textarea
        ref={verticalInputRef}
        className="ed-vertical-input"
        aria-label="縦書き本文"
        value={verticalText}
        onChange={(event) => {
          const previous = verticalText;
          const next = event.target.value;
          verticalUndoRef.current = [...verticalUndoRef.current, previous].slice(-200);
          verticalRedoRef.current = [];
          setVerticalText(next);
          onChangeRef.current(next);
        }}
        spellCheck={false}
      />
    </div>
  );
});

export default Editor;
