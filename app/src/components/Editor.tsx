import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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
import { chapterEdit, newpageEdit, rubyEdit, type Edit } from '../lib/editor/notation';
import './editor.css';

/** 記法（見出し・改ページ・ルビ）を色分けして、範囲が分かるようにする。 */
const tags = new MatchDecorator({
  regexp: /\[\[rb:[^\]\n]*\]\]|\[chapter:[^\]\n]*\]|\[newpage\]/g,
  decoration: (m) =>
    Decoration.mark({ class: m[0].startsWith('[[rb') ? 'tag-ruby' : m[0].startsWith('[chapter') ? 'tag-chapter' : 'tag-newpage' }),
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
  undo: () => void;
  redo: () => void;
  /** カーソルのある行（0 始まり） */
  cursorLine: () => number;
  focus: () => void;
};

type Props = {
  initial: string;
  /** 開いたときにカーソルを置く行（0 始まり） */
  startLine?: number;
  onChange: (text: string) => void;
};

/** 加筆修正モードのエディタ（CodeMirror 6。v1 は横書き固定）。 */
const Editor = forwardRef<EditorHandle, Props>(function Editor({ initial, startLine, onChange }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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

  useImperativeHandle(ref, () => {
    const apply = (make: (t: string, f: number, to: number) => Edit) => {
      const v = viewRef.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const e = make(v.state.doc.toString(), from, to);
      v.dispatch({
        changes: { from: e.from, to: e.to, insert: e.insert },
        selection: { anchor: e.caret[0], head: e.caret[1] },
        scrollIntoView: true,
      });
      v.focus();
    };
    return {
      chapter: () => apply(chapterEdit),
      newpage: () => apply(newpageEdit),
      ruby: () => apply(rubyEdit),
      undo: () => viewRef.current && undo(viewRef.current),
      redo: () => viewRef.current && redo(viewRef.current),
      cursorLine: () => {
        const v = viewRef.current;
        return v ? v.state.doc.lineAt(v.state.selection.main.head).number - 1 : 0;
      },
      focus: () => viewRef.current?.focus(),
    };
  }, []);

  return <div className="ed-host" ref={hostRef} />;
});

export default Editor;
