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

function getEditableText(element: HTMLElement): string {
  let text = '';
  const append = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (child.tagName === 'BR') {
      text += '\n';
      return;
    }
    const isBlock = /^(DIV|LI|P|PRE|BLOCKQUOTE)$/.test(child.tagName);
    if (isBlock && text.length > 0 && !text.endsWith('\n')) text += '\n';
    for (const nested of child.childNodes) append(nested);
  };
  for (const child of element.childNodes) append(child);
  return text.replace(/\r\n?/g, '\n');
}

function getTextOffset(element: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  const content = document.createElement('div');
  content.append(range.cloneContents());
  return getEditableText(content).length;
}

/** 加筆修正モードのエディタ（CodeMirror 6）。 */
const Editor = forwardRef<EditorHandle, Props>(function Editor({ initial, startLine, onChange, vertical }, ref) {
  const codeMirrorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const verticalInputRef = useRef<HTMLTextAreaElement>(null);
  const verticalPreviewRef = useRef<HTMLDivElement>(null);
  const verticalCaretRef = useRef<HTMLSpanElement>(null);
  const previousVerticalRef = useRef(vertical);
  const verticalUndoRef = useRef<string[]>([]);
  const verticalRedoRef = useRef<string[]>([]);
  const isComposingRef = useRef(false);
  const compositionStartTextRef = useRef(initial);
  const skipCompositionInputHistoryRef = useRef(false);
  const [verticalText, setVerticalText] = useState(initial);
  const [verticalSelection, setVerticalSelection] = useState({ start: initial.length, end: initial.length });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const verticalRef = useRef(vertical);
  verticalRef.current = vertical;

  useEffect(() => {
    const host = codeMirrorHostRef.current;
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
    const input = verticalInputRef.current;
    if (!view || !input) return;

    if (vertical) {
      const { head, anchor } = view.state.selection.main;
      const text = view.state.doc.toString();
      setVerticalText(text);
      setVerticalSelection({ start: Math.min(anchor, head), end: Math.max(anchor, head) });
      input.value = text;
      input.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head), anchor <= head ? 'forward' : 'backward');
      verticalUndoRef.current = [];
      verticalRedoRef.current = [];
      previousVerticalRef.current = true;
      return;
    }

    const text = input.value;
    const anchor = input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart;
    const head = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
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
        anchor,
        head,
      },
    });
    previousVerticalRef.current = false;
    view.focus();
    setVerticalText(text);
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

  const updateVerticalText = (nextText: string, selectionStart: number, selectionEnd = selectionStart) => {
    verticalUndoRef.current = [...verticalUndoRef.current, verticalText].slice(-200);
    verticalRedoRef.current = [];
    if (verticalInputRef.current) verticalInputRef.current.value = nextText;
    setVerticalText(nextText);
    setVerticalSelection({ start: selectionStart, end: selectionEnd });
    onChangeRef.current(nextText);
    requestAnimationFrame(() => {
      const input = verticalInputRef.current;
      if (!input) return;
      input.setSelectionRange(selectionStart, selectionEnd);
      input.focus();
    });
  };

  useLayoutEffect(() => {
    if (!vertical) return;
    const preview = verticalPreviewRef.current;
    const caret = verticalCaretRef.current;
    if (preview && caret) {
      const previewRect = preview.getBoundingClientRect();
      const caretRect = caret.getBoundingClientRect();
      const horizontalMargin = 16;
      if (caretRect.left < previewRect.left + horizontalMargin) {
        preview.scrollLeft -= previewRect.left + horizontalMargin - caretRect.left;
      } else if (caretRect.right > previewRect.right - horizontalMargin) {
        preview.scrollLeft += caretRect.right - previewRect.right + horizontalMargin;
      }
      preview.scrollTop = 0;
    }
  }, [vertical, verticalText, verticalSelection]);

  useImperativeHandle(ref, () => {
    const apply = (make: (t: string, f: number, to: number) => Edit) => {
      if (verticalRef.current) {
        const input = verticalInputRef.current;
        if (!input) return;
        const anchor = input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart;
        const head = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
        const e = make(verticalText, Math.min(anchor, head), Math.max(anchor, head));
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
        const input = verticalInputRef.current;
        const position = Math.min(input?.selectionStart ?? previous.length, previous.length);
        verticalRedoRef.current.push(verticalText);
        if (input) {
          input.value = previous;
          input.setSelectionRange(position, position);
        }
        setVerticalText(previous);
        setVerticalSelection({ start: position, end: position });
        onChangeRef.current(previous);
        input?.focus();
      },
      redo: () => {
        if (!verticalRef.current) return viewRef.current && redo(viewRef.current);
        const next = verticalRedoRef.current.pop();
        if (next === undefined) return;
        const input = verticalInputRef.current;
        const position = Math.min(input?.selectionStart ?? next.length, next.length);
        verticalUndoRef.current.push(verticalText);
        if (input) {
          input.value = next;
          input.setSelectionRange(position, position);
        }
        setVerticalText(next);
        setVerticalSelection({ start: position, end: position });
        onChangeRef.current(next);
        input?.focus();
      },
      cursorLine: () => {
        if (verticalRef.current) {
          const input = verticalInputRef.current;
          return input ? input.value.slice(0, input.selectionStart).split(/\r?\n/).length - 1 : 0;
        }
        const v = viewRef.current;
        return v ? v.state.doc.lineAt(v.state.selection.main.head).number - 1 : 0;
      },
      jumpToLine: (line: number) => {
        if (verticalRef.current) {
          const input = verticalInputRef.current;
          if (!input) return 1;
          const lines = verticalText.split(/\r?\n/);
          const targetLine = Math.min(Math.max(Math.trunc(line), 1), lines.length);
          const pos = lines.slice(0, targetLine - 1).reduce((sum, item) => sum + item.length + 1, 0);
          input.setSelectionRange(pos, pos);
          setVerticalSelection({ start: pos, end: pos });
          input.focus();
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
      focus: () => {
        if (verticalRef.current) verticalInputRef.current?.focus();
        else viewRef.current?.focus();
      },
    };
  }, [verticalText]);

  return (
    <div className="ed-host">
      <div
        ref={codeMirrorHostRef}
        className="ed-cm-host"
        hidden={vertical}
        aria-hidden={vertical}
      />
      <div className="ed-vertical-surface" hidden={!vertical}>
        <div
          ref={verticalPreviewRef}
          className="ed-vertical-preview"
          aria-hidden="true"
          onClick={(event) => {
            const input = verticalInputRef.current;
            const preview = verticalPreviewRef.current;
            if (!input || !preview) return;
            const doc = input.ownerDocument as Document & {
              caretRangeFromPoint?: (x: number, y: number) => Range | null;
            };
            const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
            if (range && preview.contains(range.startContainer)) {
              const position = getTextOffset(preview, range.startContainer, range.startOffset);
              input.setSelectionRange(position, position);
              setVerticalSelection({ start: position, end: position });
            }
            input.focus();
          }}
        >
          {verticalText.slice(0, verticalSelection.start)}
          <span ref={verticalCaretRef} className="ed-vertical-caret" />
          {verticalText.slice(verticalSelection.end)}
          <span className="ed-vertical-scroll-tail" aria-hidden="true" />
        </div>
        <textarea
        ref={verticalInputRef}
        className="ed-vertical-input"
        aria-label="縦書き本文"
        defaultValue={initial}
        aria-hidden={!vertical}
        tabIndex={vertical ? 0 : -1}
        onInput={(event) => {
          const previous = verticalText;
          const input = event.currentTarget;
          const next = input.value;
          if (next === previous) return;
          const composing = isComposingRef.current || (event.nativeEvent as InputEvent).isComposing;
          if (!composing && !skipCompositionInputHistoryRef.current) {
            verticalUndoRef.current = [...verticalUndoRef.current, previous].slice(-200);
            verticalRedoRef.current = [];
          }
          skipCompositionInputHistoryRef.current = false;
          setVerticalSelection({ start: input.selectionStart, end: input.selectionEnd });
          setVerticalText(next);
          onChangeRef.current(next);
        }}
        onCompositionStart={() => {
          compositionStartTextRef.current = verticalText;
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
          const input = event.currentTarget;
          const next = input.value;
          const previous = compositionStartTextRef.current;
          if (next !== previous) {
            verticalUndoRef.current = [...verticalUndoRef.current, previous].slice(-200);
            verticalRedoRef.current = [];
          }
          setVerticalSelection({ start: input.selectionStart, end: input.selectionEnd });
          skipCompositionInputHistoryRef.current = true;
          requestAnimationFrame(() => {
            skipCompositionInputHistoryRef.current = false;
          });
          if (next !== verticalText) {
            setVerticalText(next);
            onChangeRef.current(next);
          }
        }}
        onSelect={(event) => {
          const input = event.currentTarget;
          setVerticalSelection({ start: input.selectionStart, end: input.selectionEnd });
        }}
        onPaste={(event) => {
          event.preventDefault();
          const input = event.currentTarget;
          const pasted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
          const from = input.selectionStart;
          const to = input.selectionEnd;
          const next = input.value.slice(0, from) + pasted + input.value.slice(to);
          updateVerticalText(next, from + pasted.length);
        }}
        spellCheck={false}
      />
      </div>
    </div>
  );
});

export default Editor;
