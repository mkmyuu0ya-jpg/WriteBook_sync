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

function getSelectionOffsets(element: HTMLElement): { anchor: number; head: number } {
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;
  const focusNode = selection?.focusNode;
  if (!selection || !anchorNode || !focusNode || !element.contains(anchorNode) || !element.contains(focusNode)) {
    const end = getEditableText(element).length;
    return { anchor: end, head: end };
  }
  return {
    anchor: getTextOffset(element, anchorNode, selection.anchorOffset),
    head: getTextOffset(element, focusNode, selection.focusOffset),
  };
}

function setSelectionOffsets(element: HTMLElement, anchor: number, head = anchor): void {
  const locate = (offset: number): { node: Node; offset: number } => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let last: Node | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      last = node;
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    return last
      ? { node: last, offset: last.textContent?.length ?? 0 }
      : { node: element, offset: 0 };
  };

  const selection = window.getSelection();
  if (!selection) return;
  const anchorPosition = locate(anchor);
  const headPosition = locate(head);
  selection.removeAllRanges();
  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchorPosition.node, anchorPosition.offset, headPosition.node, headPosition.offset);
    return;
  }
  const range = document.createRange();
  const forward = anchor <= head;
  const start = forward ? anchorPosition : headPosition;
  const end = forward ? headPosition : anchorPosition;
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.addRange(range);
  if (!forward && typeof selection.extend === 'function') {
    selection.collapse(end.node, end.offset);
    selection.extend(start.node, start.offset);
  }
}

function insertTextAtSelection(element: HTMLElement, text: string): string {
  const selection = window.getSelection();
  const range = document.createRange();
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (selectedRange && element.contains(selectedRange.commonAncestorContainer)) {
    range.setStart(selectedRange.startContainer, selectedRange.startOffset);
    range.setEnd(selectedRange.endContainer, selectedRange.endOffset);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  range.deleteContents();
  const inserted = document.createTextNode(text);
  range.insertNode(inserted);
  range.setStartAfter(inserted);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const next = getEditableText(element);
  const caret = getTextOffset(element, range.startContainer, range.startOffset);
  element.textContent = next;
  setSelectionOffsets(element, caret);
  return next;
}

/** 加筆修正モードのエディタ（CodeMirror 6）。 */
const Editor = forwardRef<EditorHandle, Props>(function Editor({ initial, startLine, onChange, vertical }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const verticalInputRef = useRef<HTMLDivElement>(null);
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
    const input = verticalInputRef.current;
    if (!view || !input) return;

    if (vertical) {
      const { head, anchor } = view.state.selection.main;
      const text = view.state.doc.toString();
      setVerticalText(text);
      verticalUndoRef.current = [];
      verticalRedoRef.current = [];
      previousVerticalRef.current = true;
      requestAnimationFrame(() => {
        setSelectionOffsets(input, anchor, head);
        input.focus();
      });
      return;
    }

    const { anchor, head } = getSelectionOffsets(input);
    const text = getEditableText(input);
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
  }, [vertical]);

  useLayoutEffect(() => {
    if (!vertical) return;
    const input = verticalInputRef.current;
    if (input && getEditableText(input) !== verticalText) input.textContent = verticalText;
  }, [vertical, verticalText]);

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
    setVerticalText(nextText);
    onChangeRef.current(nextText);
    requestAnimationFrame(() => {
      const input = verticalInputRef.current;
      if (!input) return;
      if (getEditableText(input) !== nextText) input.textContent = nextText;
      setSelectionOffsets(input, selectionStart, selectionEnd);
      input.focus();
    });
  };

  const insertVerticalText = (text: string) => {
    const input = verticalInputRef.current;
    if (!input) return;
    const previous = verticalText;
    const next = insertTextAtSelection(input, text);
    if (next === previous) return;
    verticalUndoRef.current = [...verticalUndoRef.current, previous].slice(-200);
    verticalRedoRef.current = [];
    setVerticalText(next);
    onChangeRef.current(next);
  };

  useImperativeHandle(ref, () => {
    const apply = (make: (t: string, f: number, to: number) => Edit) => {
      if (verticalRef.current) {
        const input = verticalInputRef.current;
        if (!input) return;
        const { anchor, head } = getSelectionOffsets(input);
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
        const selection = input ? getSelectionOffsets(input) : { anchor: previous.length, head: previous.length };
        verticalRedoRef.current.push(verticalText);
        setVerticalText(previous);
        onChangeRef.current(previous);
        requestAnimationFrame(() => {
          if (!input) return;
          if (getEditableText(input) !== previous) input.textContent = previous;
          setSelectionOffsets(input, Math.min(selection.anchor, previous.length), Math.min(selection.head, previous.length));
          input.focus();
        });
      },
      redo: () => {
        if (!verticalRef.current) return viewRef.current && redo(viewRef.current);
        const next = verticalRedoRef.current.pop();
        if (next === undefined) return;
        const input = verticalInputRef.current;
        const selection = input ? getSelectionOffsets(input) : { anchor: next.length, head: next.length };
        verticalUndoRef.current.push(verticalText);
        setVerticalText(next);
        onChangeRef.current(next);
        requestAnimationFrame(() => {
          if (!input) return;
          if (getEditableText(input) !== next) input.textContent = next;
          setSelectionOffsets(input, Math.min(selection.anchor, next.length), Math.min(selection.head, next.length));
          input.focus();
        });
      },
      cursorLine: () => {
        if (verticalRef.current) {
          const input = verticalInputRef.current;
          const { head } = input ? getSelectionOffsets(input) : { head: 0 };
          return verticalText.slice(0, head).split(/\r?\n/).length - 1;
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
          setSelectionOffsets(input, pos);
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
    <div className={`ed-host${vertical ? ' ed-host-vertical' : ''}`} ref={hostRef}>
      <div
        ref={verticalInputRef}
        className="ed-vertical-input"
        aria-label="縦書き本文"
        role="textbox"
        aria-multiline="true"
        contentEditable={vertical}
        suppressContentEditableWarning
        onInput={(event) => {
          const previous = verticalText;
          const input = event.currentTarget;
          const next = getEditableText(input);
          const selection = getSelectionOffsets(input);
          if (input.childElementCount > 0 || input.textContent !== next) {
            input.textContent = next;
            setSelectionOffsets(input, selection.anchor, selection.head);
          }
          if (next === previous) return;
          verticalUndoRef.current = [...verticalUndoRef.current, previous].slice(-200);
          verticalRedoRef.current = [];
          setVerticalText(next);
          onChangeRef.current(next);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
          insertVerticalText(pasted);
        }}
        spellCheck={false}
      />
    </div>
  );
});

export default Editor;
