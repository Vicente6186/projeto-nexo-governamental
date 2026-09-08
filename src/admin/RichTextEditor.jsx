import React, { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { EditorState } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo2,
  Redo2,
  Code2,
  Type,
  Info,
} from "lucide-react";
import { Button, Field, Modal } from "./components";
import { isSafeEditorialUrl, unsupportedMarkdownReason } from "./richtext.cjs";
import "./richtext.css";

const extensions = [
  StarterKit.configure({
    underline: false,
    link: {
      openOnClick: false,
      autolink: false,
      defaultProtocol: "https",
      isAllowedUri: (url) => isSafeEditorialUrl(url),
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    },
  }),
  Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
];

export default function RichTextEditor({
  value = "",
  onChange,
  disabled = false,
  error = "",
  onBlur,
}) {
  const source = String(value ?? "");
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);
  const acceptedValue = useRef(null);
  const [advanced, setAdvanced] = useState(false);
  const [unsupported, setUnsupported] = useState("");
  const [link, setLink] = useState(null);
  const [linkError, setLinkError] = useState("");
  const helpId = useId();
  const sourceId = useId();
  const errorId = useId();
  const describedBy = error ? `${helpId} ${errorId}` : helpId;
  changeRef.current = onChange;
  blurRef.current = onBlur;

  const editor = useEditor({
    extensions,
    content: "",
    contentType: "markdown",
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Texto do artigo",
        "aria-multiline": "true",
        "aria-describedby": describedBy,
        "aria-invalid": String(!!error),
        "data-blog-field": "body",
        class: "richtext-document",
        spellcheck: "true",
        "data-placeholder": "Comece a escrever seu artigo…",
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      acceptedValue.current = markdown;
      changeRef.current?.(markdown);
    },
    onBlur: () => blurRef.current?.(),
  });
  const active =
    useEditorState({
      editor,
      selector: ({ editor: current }) =>
        current
          ? {
              bold: current.isActive("bold"),
              italic: current.isActive("italic"),
              heading: current.isActive("heading", { level: 2 }),
              bulletList: current.isActive("bulletList"),
              orderedList: current.isActive("orderedList"),
              blockquote: current.isActive("blockquote"),
              link: current.isActive("link"),
              canUndo: current.can().undo(),
              canRedo: current.can().redo(),
            }
          : {},
    }) || {};

  // Parent echoes of our own edits never replace the document or move the caret.
  // Loading a different revision uses Tiptap's parser without emitting a save.
  useEffect(() => {
    if (!editor || acceptedValue.current === source) return;
    const reason = unsupportedMarkdownReason(source, (text) =>
      editor.markdown.instance.lexer(text),
    );
    setUnsupported(reason);
    acceptedValue.current = source;
    if (!reason) {
      const { from, to } = editor.state.selection;
      const focused = editor.isFocused;
      // A recovered revision starts its own undo history. Retaining the old
      // plugin state would let Undo/Redo apply edits from the replaced body.
      editor.view.updateState(
        EditorState.create({
          schema: editor.schema,
          doc: editor.state.doc,
          selection: editor.state.selection,
          plugins: editor.state.plugins,
        }),
      );
      // Hydration is not a user edit: Undo must never remove the loaded article.
      editor
        .chain()
        .setContent(source, { contentType: "markdown", emitUpdate: false })
        .setMeta("addToHistory", false)
        .run();
      if (focused) {
        const end = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.min(from, end),
          to: Math.min(to, end),
        });
      }
    }
  }, [editor, source]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-invalid", String(!!error));
    editor.view.dom.setAttribute("aria-describedby", describedBy);
  }, [editor, error, describedBy]);

  const markdownMode = advanced || !!unsupported;
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled && !markdownMode, false);
      editor.view.dom.setAttribute(
        "aria-disabled",
        String(disabled || markdownMode),
      );
    }
  }, [editor, disabled, markdownMode]);

  function openLink() {
    if (!editor) return;
    if (editor.isActive("link")) editor.commands.extendMarkRange("link");
    const { from, to } = editor.state.selection;
    setLink({
      from,
      to,
      href: editor.getAttributes("link").href || "",
      text: "",
      existing: editor.isActive("link"),
    });
    setLinkError("");
  }
  function applyLink(event) {
    event.preventDefault();
    const href = link.href.trim();
    if (!isSafeEditorialUrl(href)) {
      setLinkError(
        "Use um endereço http:// ou https://, e-mail mailto: ou um caminho do próprio site.",
      );
      return;
    }
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: link.from, to: link.to });
    if (link.from === link.to) {
      chain
        .insertContent({
          type: "text",
          text: link.text.trim() || href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      chain.setLink({ href }).run();
    }
    setLink(null);
  }
  function toolbarKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [
      ...event.currentTarget.querySelectorAll("button:not(:disabled)"),
    ];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
  const tools = [
    ["Negrito", Bold, "bold", () => editor.chain().focus().toggleBold().run()],
    [
      "Itálico",
      Italic,
      "italic",
      () => editor.chain().focus().toggleItalic().run(),
    ],
    [
      "Subtítulo",
      Heading2,
      "heading",
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    ],
    [
      "Lista com marcadores",
      List,
      "bulletList",
      () => editor.chain().focus().toggleBulletList().run(),
    ],
    [
      "Lista numerada",
      ListOrdered,
      "orderedList",
      () => editor.chain().focus().toggleOrderedList().run(),
    ],
    [
      "Citação",
      Quote,
      "blockquote",
      () => editor.chain().focus().toggleBlockquote().run(),
    ],
    ["Inserir link", Link2, "link", openLink],
  ];

  return (
    <div className={`richtext-editor ${disabled ? "richtext-disabled" : ""}`}>
      <div className="richtext-heading">
        <button
          type="button"
          className="richtext-mode"
          onClick={() => setAdvanced(!markdownMode)}
          disabled={disabled || !!unsupported}
          aria-pressed={markdownMode}
          title={
            unsupported
              ? "Este conteúdo precisa do modo Markdown para manter toda a formatação."
              : undefined
          }
        >
          {markdownMode ? <Type size={15} /> : <Code2 size={15} />}
          {markdownMode ? "Editor visual" : "Editar Markdown"}
        </button>
      </div>
      {unsupported && (
        <div className="richtext-preserve" role="status">
          <Info size={17} />
          <p>
            Este artigo contém {unsupported}. O modo Markdown mantém esse
            conteúdo intacto. Você pode editar o texto abaixo.
          </p>
        </div>
      )}
      <div className="richtext-surface">
        {!markdownMode && (
          <div
            className="richtext-toolbar"
            role="toolbar"
            aria-label="Formatação do artigo"
            onKeyDown={toolbarKeyDown}
          >
            <div className="richtext-tool-group">
              {tools.map(([label, Icon, key, action]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={!!active[key]}
                  disabled={disabled || !editor}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={action}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <div className="richtext-tool-group richtext-history">
              <button
                type="button"
                aria-label="Desfazer"
                title="Desfazer"
                disabled={disabled || !editor || !active.canUndo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 size={17} />
              </button>
              <button
                type="button"
                aria-label="Refazer"
                title="Refazer"
                disabled={disabled || !editor || !active.canRedo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 size={17} />
              </button>
            </div>
          </div>
        )}
        {markdownMode ? (
          <textarea
            id={sourceId}
            className="richtext-source"
            aria-label="Conteúdo do artigo em Markdown"
            aria-describedby={describedBy}
            aria-invalid={!!error}
            data-blog-field="body"
            value={source}
            disabled={disabled}
            onChange={(event) => changeRef.current?.(event.target.value)}
            onBlur={() => blurRef.current?.()}
            placeholder="Escreva o conteúdo em Markdown…"
            spellCheck
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      <p id={helpId} className="richtext-hint">
        {markdownMode
          ? "Edição em Markdown."
          : "Selecione o texto para formatar."}
      </p>
      {error && (
        <p id={errorId} className="field-error richtext-error" role="alert">
          {error}
        </p>
      )}
      {link && (
        <Modal
          title={link.existing ? "Editar link" : "Inserir link"}
          description="Defina o endereço que o leitor poderá abrir."
          onClose={() => setLink(null)}
        >
          <form onSubmit={applyLink}>
            {link.from === link.to && (
              <Field
                label="Texto do link"
                value={link.text}
                onChange={(text) => setLink({ ...link, text })}
                placeholder="Ex.: Conheça o projeto"
              />
            )}
            <Field
              label="Endereço do link"
              value={link.href}
              onChange={(href) => {
                setLink({ ...link, href });
                setLinkError("");
              }}
              placeholder="https://…"
              autoFocus
            />
            {linkError && (
              <p className="richtext-link-error" role="alert">
                {linkError}
              </p>
            )}
            <div className="modal-actions richtext-link-actions">
              {link.existing && (
                <Button
                  type="button"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .setTextSelection({ from: link.from, to: link.to })
                      .unsetLink()
                      .run();
                    setLink(null);
                  }}
                >
                  Remover link
                </Button>
              )}
              <Button type="button" onClick={() => setLink(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Aplicar link
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
