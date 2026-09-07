import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Heading2,
  Image as ImageIcon,
  Italic,
  Bold,
  Link as LinkIcon,
  List,
  LoaderCircle,
  Monitor,
  Plus,
  Quote,
  Search,
  Send,
  Settings2,
  Smartphone,
  Upload,
  X,
  Archive,
  RotateCcw,
  Globe2,
  Save,
  AlertCircle,
} from "lucide-react";
import { api } from "./api";
import {
  Badge,
  Button,
  Empty,
  Field,
  Loading,
  Modal,
  Tabs,
  Toggle,
  dateLabel,
} from "./components";
import "./blog.css";

const STATUS_TABS = [
  { id: "all", label: "Todos" },
  { id: "draft", label: "Rascunhos" },
  { id: "published", label: "Publicados" },
  { id: "archived", label: "Arquivados" },
];
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const slugify = (value) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
const minutes = (body) =>
  Math.max(
    1,
    Math.ceil(
      (
        String(body || "")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .match(/[\p{L}\p{N}]+/gu) || []
      ).length / 220,
    ),
  );
const categoryValue = (item) =>
  typeof item === "string" ? item : item.id || item.value || item.name;
const categoryLabel = (item) =>
  typeof item === "string" ? item : item.label || item.name || item.id;
const equivalent = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);
const blankPost = (category = "") => ({
  title: "",
  slug: "",
  excerpt: "",
  category,
  author: "",
  authorRole: "",
  coverImage: "",
  coverAlt: "",
  coverCredit: "",
  body: "",
  tags: [],
  featured: false,
});
function postStatus(post) {
  if (post.archived) return { label: "Arquivado", tone: "neutral" };
  if (!post.published) return { label: "Rascunho", tone: "amber" };
  if (!equivalent(post.draft, post.published))
    return { label: "Alterações em rascunho", tone: "amber" };
  return { label: "Publicado", tone: "green" };
}

export default function BlogWorkspace({
  route = "blog",
  session,
  mediaAssets = [],
  notify,
  onSessionExpired,
  onDirtyChange,
}) {
  const postId = route.startsWith("blog/") ? route.slice(5) : null;
  const [posts, setPosts] = useState([]),
    [categories, setCategories] = useState([]);
  const [record, setRecord] = useState(null),
    [draft, setDraft] = useState(null);
  const [tagsText, setTagsText] = useState(""),
    [slugManual, setSlugManual] = useState(false);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0),
    [busy, setBusy] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [modal, setModal] = useState(null),
    [preview, setPreview] = useState(null),
    [previewMobile, setPreviewMobile] = useState(false);
  const [assets, setAssets] = useState([]),
    [assetLoading, setAssetLoading] = useState(false),
    [uploading, setUploading] = useState(false);
  const [editorView, setEditorView] = useState("write");
  const bodyRef = useRef(null),
    fileRef = useRef(null),
    draftRef = useRef(draft),
    recordRef = useRef(record);
  const activeId = useRef(postId),
    saveRef = useRef(null);
  activeId.current = postId;
  draftRef.current = draft;
  recordRef.current = record;
  const dirty = !!(
    postId &&
    record &&
    draft &&
    !equivalent(draft, record.draft)
  );
  const locked = !!busy || !!record?.archived;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function fail(error) {
    if (error.status === 401) {
      onSessionExpired?.();
      return;
    }
    if (error.status === 409) setModal({ type: "conflict" });
    notify?.(
      error.message || "Não foi possível concluir. Tente novamente.",
      true,
    );
  }
  function accept(post) {
    setPosts((current) => [
      post,
      ...current.filter((item) => item.id !== post.id),
    ]);
    if (activeId.current === post.id) {
      setRecord(post);
      setDraft(structuredClone(post.draft));
      setTagsText((post.draft.tags || []).join(", "));
      setSlugManual(
        !!post.published || post.draft.slug !== slugify(post.draft.title),
      );
      recordRef.current = post;
      draftRef.current = post.draft;
    }
    return post;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setModal(null);
    setPreview(null);
    setEditorView("write");
    setRecord(null);
    setDraft(null);
    onDirtyChange?.(false);
    async function load() {
      try {
        const result = await api("/api/admin/blog");
        if (!active) return;
        setPosts(result.posts || []);
        setCategories(result.categories || []);
        if (postId) {
          const detail = await api(
            `/api/admin/blog/${encodeURIComponent(postId)}`,
          );
          if (!active) return;
          accept(detail.post);
        }
      } catch (error) {
        if (!active) return;
        setLoadError(error.message);
        if (error.status === 401) onSessionExpired?.();
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [postId, retry]);

  useEffect(() => {
    function keyDown(event) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        postId
      ) {
        event.preventDefault();
        saveRef.current?.();
      }
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [postId]);

  function patch(values) {
    setDraft((current) => ({ ...current, ...values }));
  }
  function changeTitle(title) {
    setDraft((current) => ({
      ...current,
      title,
      ...(!slugManual && !record?.published ? { slug: slugify(title) } : {}),
    }));
  }
  async function saveCurrent() {
    const current = recordRef.current,
      content = draftRef.current;
    if (!current || !content || current.archived) return current;
    if (equivalent(content, current.draft)) return current;
    const result = await api(`/api/admin/blog/${current.id}`, {
      method: "PUT",
      body: { post: content, version: current.version },
    });
    return accept(result.post);
  }
  async function save() {
    if (busy || !dirty || record?.archived) return;
    setBusy("save");
    try {
      await saveCurrent();
      notify?.("Rascunho do artigo salvo.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }
  saveRef.current = save;
  async function create() {
    if (busy) return;
    setBusy("create");
    try {
      const result = await api("/api/admin/blog", {
        method: "POST",
        body: { post: blankPost(categoryValue(categories[0] || "")) },
      });
      window.location.hash = `blog/${result.post.id}`;
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }
  async function showPreview(post = record) {
    if (busy || !post) return;
    const startingRoute = activeId.current;
    setBusy("preview");
    try {
      const saved = post.id === record?.id ? await saveCurrent() : post;
      if (activeId.current !== startingRoute) return;
      setPreview({ id: saved.id, version: saved.version });
      setPreviewMobile(false);
      if (dirty && post.id === record?.id)
        notify?.("Rascunho salvo para a prévia.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }
  async function runAction(action) {
    if (busy || !record) return;
    setBusy(action);
    try {
      const current = action !== "restore" ? await saveCurrent() : record;
      const result = await api(`/api/admin/blog/${current.id}/${action}`, {
        method: "POST",
        body: { version: current.version },
      });
      accept(result.post);
      setModal(null);
      notify?.(
        {
          publish: "Artigo publicado. Ele já está disponível no blog.",
          unpublish: "Artigo retirado do ar. O rascunho foi preservado.",
          archive: "Artigo arquivado.",
          restore: "Artigo recuperado como rascunho.",
        }[action],
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }
  async function openAssets() {
    setModal({ type: "assets" });
    setAssetLoading(true);
    try {
      const result = await api("/api/admin/assets");
      setAssets(
        Array.from(
          new Map(
            [...mediaAssets, ...(result.assets || [])].map((asset) => [
              asset.url,
              asset,
            ]),
          ).values(),
        ).filter(
          (asset) =>
            /^image\/(?:jpeg|png|avif|webp)$/.test(asset.type) ||
            /\.(avif|webp|png|jpe?g)(?:\?|$)/i.test(asset.url),
        ),
      );
    } catch (error) {
      fail(error);
    } finally {
      setAssetLoading(false);
    }
  }
  async function uploadCover(file) {
    if (!file || uploading) return;
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
      notify?.("Escolha uma imagem JPG, PNG, WebP ou AVIF.", true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify?.("A imagem deve ter até 8 MB.", true);
      return;
    }
    const startingPost = activeId.current;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/admin/uploads", { method: "POST", form });
      if (activeId.current === startingPost)
        patch({ coverImage: result.asset.url });
      setAssets((current) => [result.asset, ...current]);
      notify?.(
        activeId.current === startingPost
          ? "Capa adicionada. Salve o rascunho para guardar a alteração."
          : "Imagem enviada à biblioteca.",
      );
    } catch (error) {
      fail(error);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function format(action) {
    const input = bodyRef.current;
    if (!input || locked) return;
    const start = input.selectionStart,
      end = input.selectionEnd,
      text = draft.body || "",
      selected = text.slice(start, end);
    let insert, from, to;
    if (action === "heading" || action === "quote" || action === "list") {
      const prefix = { heading: "## ", quote: "> ", list: "- " }[action];
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const chunk = text.slice(lineStart, end) || "Texto";
      insert = chunk
        .split("\n")
        .map((line) => prefix + line)
        .join("\n");
      patch({ body: text.slice(0, lineStart) + insert + text.slice(end) });
      from = lineStart + prefix.length;
      to = lineStart + insert.length;
    } else {
      const wrappers = {
        bold: ["**", "**"],
        italic: ["_", "_"],
        link: ["[", "](https://)"],
      };
      const [before, after] = wrappers[action];
      insert = before + (selected || "Texto") + after;
      patch({ body: text.slice(0, start) + insert + text.slice(end) });
      from = start + before.length;
      to = from + (selected || "Texto").length;
    }
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(from, to);
    });
  }

  const filtered = useMemo(
    () =>
      posts
        .filter((post) => {
          const matchStatus =
            status === "all"
              ? !post.archived
              : status === "archived"
                ? post.archived
                : !post.archived &&
                  (status === "published"
                    ? !!post.published
                    : !post.published ||
                      !equivalent(post.draft, post.published));
          const searchable = [
            post.draft.title,
            post.draft.author,
            post.draft.category,
            ...(post.draft.tags || []),
          ].join(" ");
          return (
            matchStatus &&
            normalize(searchable).includes(normalize(query.trim()))
          );
        })
        .sort(
          (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt),
        ),
    [posts, query, status],
  );
  const requirements = draft
    ? [
        { label: "Título", valid: !!draft.title.trim() },
        { label: "Resumo", valid: !!draft.excerpt.trim() },
        { label: "Autoria", valid: !!draft.author.trim() },
        { label: "Categoria", valid: !!draft.category },
        { label: "Texto do artigo", valid: !!draft.body.trim() },
        {
          label: "Endereço do artigo",
          valid:
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug || "") &&
            !["preview", "admin", "api"].includes(draft.slug),
        },
        ...(draft.coverImage
          ? [
              {
                label: "Descrição acessível da capa",
                valid: !!draft.coverAlt.trim(),
              },
            ]
          : []),
      ]
    : [];
  const ready = requirements.every((item) => item.valid);

  if (loading)
    return (
      <Loading label={postId ? "Abrindo o artigo…" : "Carregando o blog…"} />
    );
  if (loadError || (postId && !record))
    return (
      <div className="card blog-error">
        <Empty
          icon={AlertCircle}
          title="Não foi possível carregar"
          description={loadError || "Este artigo não foi encontrado."}
        >
          <div className="blog-inline-actions">
            <Button
              onClick={() => setRetry((value) => value + 1)}
              icon={RotateCcw}
            >
              Tentar novamente
            </Button>
            {postId && (
              <a className="button button-secondary" href="#blog">
                Voltar ao blog
              </a>
            )}
          </div>
        </Empty>
      </div>
    );

  return (
    <div className="blog-workspace">
      {!postId ? (
        <>
          <div className="blog-list-intro">
            <div>
              <span className="blog-section-eyebrow">ESPAÇO EDITORIAL</span>
              <h2>Conhecimento que circula.</h2>
              <p>Artigos, encontros e perspectivas do Nexo Governamental.</p>
            </div>
            <div className="blog-inline-actions">
              <a
                href="/blog/"
                target="_blank"
                rel="noreferrer"
                className="button button-secondary"
              >
                <ArrowUpRight size={16} /> Ver blog
              </a>
              <Button
                variant="primary"
                icon={busy === "create" ? LoaderCircle : Plus}
                onClick={create}
                disabled={!!busy}
              >
                {busy === "create" ? "Criando…" : "Novo artigo"}
              </Button>
            </div>
          </div>
          {session?.localPreview && (
            <div className="blog-preview-note">
              <span>Conheça o blog com os rascunhos antes de publicar.</span>
              <a href="/blog/?preview=1" target="_blank" rel="noreferrer">
                Abrir prévia editorial <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          <section
            className="card blog-collection"
            aria-label="Artigos do blog"
          >
            <div className="blog-collection-toolbar">
              <Tabs
                label="Filtrar artigos por status"
                value={status}
                onChange={setStatus}
                tabs={STATUS_TABS}
                panelId="blog-posts-panel"
              />
              <label className="blog-search">
                <Search size={17} />
                <span className="sr-only">Buscar artigos</span>
                <input
                  placeholder="Buscar artigo, autor ou tema…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Limpar busca de artigos"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
            </div>
            <div
              role="tabpanel"
              id="blog-posts-panel"
              aria-labelledby={`blog-posts-panel-tab-${status}`}
              tabIndex={0}
            >
              {filtered.length > 0 ? (
                <>
                  <div className="blog-table-heading">
                    <span>
                      {filtered.length}{" "}
                      {filtered.length === 1 ? "artigo" : "artigos"}
                    </span>
                    <span>Última edição</span>
                    <span>Status</span>
                    <span className="sr-only">Ações</span>
                  </div>
                  <div className="blog-post-list">
                    {filtered.map((post) => {
                      const state = postStatus(post),
                        content = post.draft;
                      return (
                        <article className="blog-post-row" key={post.id}>
                          <a
                            className="blog-post-main"
                            href={`#blog/${post.id}`}
                            aria-label={`Editar ${content.title || "artigo sem título"}`}
                          >
                            <div className="blog-post-thumb">
                              {content.coverImage ? (
                                <img
                                  src={content.coverImage}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <FileText size={23} strokeWidth={1.4} />
                              )}
                            </div>
                            <div className="blog-post-copy">
                              <span className="blog-post-category">
                                {categories.find(
                                  (item) =>
                                    categoryValue(item) === content.category,
                                )
                                  ? categoryLabel(
                                      categories.find(
                                        (item) =>
                                          categoryValue(item) ===
                                          content.category,
                                      ),
                                    )
                                  : content.category || "Sem categoria"}
                                {content.featured && (
                                  <span className="blog-featured-label">
                                    Destaque
                                  </span>
                                )}
                              </span>
                              <h3>{content.title || "Artigo sem título"}</h3>
                              <p>
                                {content.author || "Autoria a definir"}
                                <span>·</span>
                                {minutes(content.body)} min de leitura
                              </p>
                            </div>
                          </a>
                          <time
                            className="blog-post-date"
                            dateTime={post.updatedAt}
                          >
                            {dateLabel(post.updatedAt)}
                          </time>
                          <div className="blog-post-state">
                            <Badge tone={state.tone} dot>
                              {state.label}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="icon-button blog-row-preview"
                            title="Abrir prévia"
                            aria-label={`Prévia de ${content.title || "artigo sem título"}`}
                            onClick={() => showPreview(post)}
                            disabled={!!busy}
                          >
                            <Eye size={18} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Empty
                  icon={query ? Search : BookOpen}
                  title={
                    query
                      ? "Nenhum artigo encontrado"
                      : status === "archived"
                        ? "Nenhum artigo arquivado"
                        : status === "published"
                          ? "O próximo artigo começa aqui"
                          : "Um espaço para boas ideias"
                  }
                  description={
                    query
                      ? "Tente outro título, autor ou tema."
                      : status === "archived"
                        ? "Artigos arquivados ficam guardados aqui e podem ser recuperados."
                        : status === "published"
                          ? "Os artigos aparecem no blog depois que você os publica."
                          : "Crie o primeiro rascunho e transforme o conhecimento do Nexo em leitura."
                  }
                >
                  {query ? (
                    <Button onClick={() => setQuery("")}>Limpar busca</Button>
                  ) : (
                    status !== "archived" && (
                      <Button
                        variant="primary"
                        icon={Plus}
                        onClick={create}
                        disabled={!!busy}
                      >
                        Criar artigo
                      </Button>
                    )
                  )}
                </Empty>
              )}
            </div>
          </section>
          <div className="blog-editorial-note">
            <BookOpen size={17} />
            <p>
              <strong>Da ideia à publicação.</strong> Salve seu rascunho,
              confira a prévia e publique quando estiver pronto.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="blog-editor-heading">
            <a href="#blog" className="text-button">
              <ArrowLeft size={16} /> Todos os artigos
            </a>
            <div className="blog-editor-heading-right">
              <Badge tone={postStatus(record).tone} dot>
                {postStatus(record).label}
              </Badge>
              {record.published && (
                <a
                  href={`/blog/${record.published.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-button"
                >
                  Ver publicado <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </div>
          {record.archived && (
            <div className="blog-archive-notice">
              <Archive size={19} />
              <div>
                <strong>Este artigo está arquivado.</strong>
                <p>
                  Recupere o rascunho para continuar editando e publicar
                  novamente.
                </p>
              </div>
              <Button
                icon={RotateCcw}
                onClick={() => setModal({ type: "restore" })}
                disabled={!!busy}
              >
                Recuperar artigo
              </Button>
            </div>
          )}
          <div className="blog-editor-layout">
            <div className="blog-writing-column">
              <section className="card blog-writing-card">
                <fieldset disabled={locked} className="blog-title-fields">
                  <label htmlFor="blog-title" className="blog-section-eyebrow">
                    ARTIGO DO NEXO
                  </label>
                  <textarea
                    id="blog-title"
                    aria-label="Título do artigo"
                    className="blog-title-input"
                    value={draft.title}
                    onChange={(event) => changeTitle(event.target.value)}
                    placeholder="Dê um título à sua ideia"
                    rows={2}
                    maxLength={180}
                  />
                  <Field
                    label="Resumo"
                    value={draft.excerpt}
                    onChange={(excerpt) => patch({ excerpt })}
                    multiline
                    maxLength={360}
                    placeholder="Apresente a ideia central em poucas linhas."
                    hint="Aparece na lista do blog e nas prévias de compartilhamento."
                  />
                </fieldset>
                <div className="blog-editor-divider" />
                <div className="blog-body-heading">
                  <div>
                    <h2>Texto do artigo</h2>
                    <span>{minutes(draft.body)} min de leitura</span>
                  </div>
                  <button
                    type="button"
                    className={`text-button ${editorView === "help" ? "is-active" : ""}`}
                    aria-expanded={editorView === "help"}
                    onClick={() =>
                      setEditorView((value) =>
                        value === "help" ? "write" : "help",
                      )
                    }
                  >
                    Como formatar <ChevronDown size={14} />
                  </button>
                </div>
                {editorView === "help" && (
                  <div className="blog-markdown-help">
                    <p>
                      Use a barra para formatar o texto selecionado. A prévia
                      mostra o resultado final.
                    </p>
                    <div>
                      <span>
                        <code>## Subtítulo</code>
                      </span>
                      <span>
                        <code>**Negrito**</code>
                      </span>
                      <span>
                        <code>[Fonte](https://…)</code>
                      </span>
                    </div>
                    <p>
                      Para referências, adicione uma seção “Referências” ao
                      final e inclua os links das fontes.
                    </p>
                  </div>
                )}
                <div
                  className="blog-format-toolbar"
                  role="toolbar"
                  aria-label="Formatar texto do artigo"
                >
                  {[
                    {
                      action: "heading",
                      label: "Inserir subtítulo",
                      icon: Heading2,
                    },
                    { action: "bold", label: "Negrito", icon: Bold },
                    { action: "italic", label: "Itálico", icon: Italic },
                    { action: "link", label: "Inserir link", icon: LinkIcon },
                    { action: "quote", label: "Inserir citação", icon: Quote },
                    { action: "list", label: "Inserir lista", icon: List },
                  ].map(({ action, label, icon: Icon }) => (
                    <button
                      key={action}
                      type="button"
                      className="icon-button"
                      aria-label={label}
                      title={label}
                      onClick={() => format(action)}
                      disabled={locked}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                  <span>Markdown</span>
                </div>
                <label htmlFor="blog-body" className="sr-only">
                  Texto do artigo
                </label>
                <textarea
                  ref={bodyRef}
                  id="blog-body"
                  className="blog-body-input"
                  value={draft.body}
                  onChange={(event) => patch({ body: event.target.value })}
                  placeholder="Comece a escrever. Contextualize a ideia, desenvolva seu argumento e compartilhe as fontes."
                  disabled={locked}
                  spellCheck
                  lang="pt-BR"
                  maxLength={100000}
                />
                <div className="blog-body-footer">
                  <span>
                    {String(draft.body || "")
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean)
                      .length.toLocaleString("pt-BR")}{" "}
                    palavras
                  </span>
                  <span>Rascunho privado até a publicação</span>
                </div>
              </section>
              <section className="card blog-cover-card">
                <div className="blog-card-heading">
                  <div>
                    <h2>Imagem de capa</h2>
                    <p>Uma imagem que contextualize o artigo.</p>
                  </div>
                  <Badge>Opcional</Badge>
                </div>
                <fieldset disabled={locked || uploading}>
                  <div
                    className={`blog-cover-upload ${draft.coverImage ? "has-image" : ""}`}
                  >
                    {draft.coverImage ? (
                      <>
                        <img
                          src={draft.coverImage}
                          alt={draft.coverAlt || "Prévia da capa do artigo"}
                        />
                        <button
                          type="button"
                          className="blog-remove-cover"
                          onClick={() =>
                            patch({
                              coverImage: "",
                              coverAlt: "",
                              coverCredit: "",
                            })
                          }
                          aria-label="Remover capa"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="blog-cover-placeholder">
                        <ImageIcon size={27} strokeWidth={1.3} />
                        <strong>Escolha a capa do artigo</strong>
                        <span>JPG, PNG, WebP ou AVIF · até 8 MB</span>
                      </div>
                    )}
                  </div>
                  <div className="blog-cover-actions">
                    <Button
                      icon={uploading ? LoaderCircle : Upload}
                      onClick={() => fileRef.current?.click()}
                      disabled={locked || uploading}
                    >
                      {uploading
                        ? "Enviando…"
                        : draft.coverImage
                          ? "Trocar imagem"
                          : "Enviar imagem"}
                    </Button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={openAssets}
                      disabled={locked || uploading}
                    >
                      Usar biblioteca <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    tabIndex={-1}
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-label="Enviar capa do artigo"
                    onChange={(event) => uploadCover(event.target.files?.[0])}
                  />
                  <details className="blog-image-link">
                    <summary>Usar uma imagem por link</summary>
                    <Field
                      label="Link da imagem de capa"
                      value={draft.coverImage}
                      onChange={(coverImage) => patch({ coverImage })}
                      placeholder="https://… ou /uploads/…"
                    />
                  </details>
                  {draft.coverImage && (
                    <div className="blog-cover-metadata">
                      <Field
                        label="Descrição da imagem"
                        value={draft.coverAlt}
                        onChange={(coverAlt) => patch({ coverAlt })}
                        maxLength={300}
                        hint="Descreva o que aparece na imagem para quem usa leitor de tela."
                        placeholder="Descreva a cena de forma objetiva."
                      />
                      <Field
                        label="Crédito da imagem"
                        value={draft.coverCredit}
                        onChange={(coverCredit) => patch({ coverCredit })}
                        maxLength={240}
                        placeholder="Autor ou instituição responsável pela imagem"
                      />
                    </div>
                  )}
                </fieldset>
              </section>
            </div>
            <aside
              className="blog-settings-column"
              aria-label="Configurações do artigo"
            >
              <section className="card blog-settings-card">
                <div className="blog-card-heading">
                  <h2>
                    <Settings2 size={17} /> Detalhes do artigo
                  </h2>
                </div>
                <fieldset disabled={locked}>
                  <div className="field">
                    <div className="field-label">
                      <label htmlFor="blog-category">Categoria</label>
                    </div>
                    <select
                      id="blog-category"
                      value={draft.category}
                      onChange={(event) =>
                        patch({ category: event.target.value })
                      }
                    >
                      <option value="">Selecione uma categoria</option>
                      {categories.map((item) => (
                        <option
                          key={categoryValue(item)}
                          value={categoryValue(item)}
                        >
                          {categoryLabel(item)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    label="Autoria"
                    value={draft.author}
                    onChange={(author) => patch({ author })}
                    maxLength={160}
                    placeholder="Nome da pessoa ou equipe"
                  />
                  <Field
                    label="Descrição da autoria"
                    value={draft.authorRole}
                    onChange={(authorRole) => patch({ authorRole })}
                    maxLength={180}
                    placeholder="Vínculo, área ou breve apresentação"
                    hint="Opcional. Use apenas informações confirmadas."
                  />
                  <Field
                    label="Temas"
                    value={tagsText}
                    onChange={(text) => {
                      setTagsText(text);
                      patch({
                        tags: text
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      });
                    }}
                    placeholder="Políticas públicas, extensão…"
                    hint="Separe os temas por vírgulas. Até 8 temas."
                    maxLength={300}
                  />
                  <div className="blog-featured-control">
                    <div>
                      <strong>Artigo em destaque</strong>
                      <p>Priorizar na abertura do blog.</p>
                    </div>
                    <Toggle
                      checked={draft.featured}
                      onChange={(featured) => {
                        if (!locked) patch({ featured });
                      }}
                      label="Artigo em destaque"
                    />
                  </div>
                </fieldset>
              </section>
              <details className="card blog-settings-card blog-address-card">
                <summary>
                  <span>
                    <LinkIcon size={16} /> Endereço e compartilhamento
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <fieldset disabled={locked}>
                  <Field
                    label="Endereço do artigo"
                    value={draft.slug}
                    onChange={(slug) => {
                      setSlugManual(true);
                      patch({ slug });
                    }}
                    maxLength={120}
                    readOnly={!!record.published}
                    hint={
                      record.published
                        ? "O endereço fica protegido enquanto o artigo está publicado."
                        : "Use letras minúsculas, números e hífens."
                    }
                    placeholder="titulo-do-artigo"
                  />
                  <div className="blog-url-preview">
                    /blog/<strong>{draft.slug || "titulo-do-artigo"}</strong>/
                  </div>
                  {record.published && (
                    <p className="field-hint">
                      Manter o endereço preserva os links já compartilhados.
                    </p>
                  )}
                </fieldset>
              </details>
              <div className="blog-publication-info">
                <Clock3 size={16} />
                <div>
                  <span>Último rascunho salvo</span>
                  <strong>{dateLabel(record.updatedAt, true)}</strong>
                  {record.publishedAt && (
                    <p>Publicado em {dateLabel(record.publishedAt)}</p>
                  )}
                </div>
              </div>
              {!record.archived && (
                <div className="blog-secondary-actions">
                  {record.published && (
                    <button
                      type="button"
                      onClick={() => setModal({ type: "unpublish" })}
                      disabled={!!busy}
                    >
                      <Globe2 size={15} /> Retirar do ar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModal({ type: "archive" })}
                    disabled={!!busy}
                  >
                    <Archive size={15} /> Arquivar artigo
                  </button>
                </div>
              )}
            </aside>
          </div>
          <div
            className="blog-savebar"
            role="region"
            aria-label="Salvar e publicar artigo"
          >
            <div className={`blog-save-status ${dirty ? "is-dirty" : ""}`}>
              {dirty ? (
                <span className="blog-unsaved-dot" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              <span>
                {busy === "save"
                  ? "Salvando rascunho…"
                  : dirty
                    ? "Alterações não salvas"
                    : "Rascunho salvo"}
              </span>
            </div>
            <div className="blog-savebar-actions">
              <Button
                icon={Eye}
                onClick={() => showPreview()}
                disabled={!!busy}
              >
                Prévia
              </Button>
              {!record.archived && (
                <>
                  <Button
                    icon={Save}
                    onClick={save}
                    disabled={!!busy || !dirty}
                  >
                    {busy === "save" ? "Salvando…" : "Salvar rascunho"}
                  </Button>
                  <Button
                    variant="primary"
                    icon={Send}
                    onClick={() => setModal({ type: "publish" })}
                    disabled={!!busy}
                  >
                    {record.published
                      ? "Publicar alterações"
                      : "Publicar artigo"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {preview && (
        <Modal
          title="Prévia do artigo"
          description="Veja o rascunho antes de publicar. Esta prévia é privada."
          wide
          onClose={() => setPreview(null)}
        >
          <div className="blog-preview-toolbar">
            <div role="group" aria-label="Tamanho da prévia">
              <button
                type="button"
                className={previewMobile ? "" : "active"}
                aria-pressed={!previewMobile}
                onClick={() => setPreviewMobile(false)}
              >
                <Monitor size={16} /> Computador
              </button>
              <button
                type="button"
                className={previewMobile ? "active" : ""}
                aria-pressed={previewMobile}
                onClick={() => setPreviewMobile(true)}
              >
                <Smartphone size={16} /> Celular
              </button>
            </div>
            <a
              href={`/blog/preview/${preview.id}?v=${preview.version}`}
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              Abrir prévia <ExternalLink size={14} />
            </a>
          </div>
          <div
            className={`blog-preview-frame ${previewMobile ? "is-mobile" : ""}`}
          >
            <iframe
              title="Prévia privada do artigo no blog"
              src={`/blog/preview/${preview.id}?v=${preview.version}`}
            />
          </div>
        </Modal>
      )}
      {modal?.type === "publish" && (
        <Modal
          title={
            record.published
              ? "Publicar as alterações?"
              : "Publicar este artigo?"
          }
          description="O conteúdo ficará disponível para todas as pessoas que acessarem o blog."
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="blog-publish-summary">
            <span>{draft.category || "Categoria a definir"}</span>
            <h3>{draft.title || "Artigo sem título"}</h3>
            <p>{draft.excerpt || "Adicione um resumo antes de publicar."}</p>
            <div>
              {draft.author || "Autoria a definir"} <span>·</span>{" "}
              {minutes(draft.body)} min de leitura
            </div>
          </div>
          {!ready && (
            <div className="blog-publish-requirements">
              <strong>Complete antes de publicar</strong>
              {requirements
                .filter((item) => !item.valid)
                .map((item) => (
                  <span key={item.label}>
                    <AlertCircle size={14} /> {item.label}
                  </span>
                ))}
            </div>
          )}
          {dirty && (
            <p className="blog-dialog-note">
              Suas alterações serão salvas e publicadas juntas.
            </p>
          )}
          <div className="blog-modal-actions">
            <Button onClick={() => setModal(null)} disabled={!!busy}>
              Continuar editando
            </Button>
            <Button
              variant="primary"
              icon={Send}
              onClick={() => runAction("publish")}
              disabled={!!busy || !ready}
            >
              {busy === "publish" ? "Publicando…" : "Confirmar publicação"}
            </Button>
          </div>
        </Modal>
      )}
      {["archive", "unpublish", "restore"].includes(modal?.type) && (
        <Modal
          title={
            {
              archive: "Arquivar este artigo?",
              unpublish: "Retirar este artigo do ar?",
              restore: "Recuperar este artigo?",
            }[modal.type]
          }
          description={
            {
              archive:
                "O artigo sai do blog e fica guardado na aba Arquivados. Você pode recuperá-lo depois.",
              unpublish:
                "O artigo deixa de aparecer no blog. O rascunho continua disponível para edição.",
              restore:
                "O artigo volta à lista como rascunho. Revise o conteúdo antes de publicá-lo novamente.",
            }[modal.type]
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="blog-action-article">
            <FileText size={20} />
            <strong>{draft?.title || "Artigo sem título"}</strong>
          </div>
          {dirty && (
            <p className="blog-dialog-note">
              Suas alterações serão salvas antes de continuar.
            </p>
          )}
          <div className="blog-modal-actions">
            <Button onClick={() => setModal(null)} disabled={!!busy}>
              Cancelar
            </Button>
            <Button
              variant={modal.type === "restore" ? "primary" : "secondary"}
              onClick={() => runAction(modal.type)}
              disabled={!!busy}
            >
              {busy
                ? "Aguarde…"
                : {
                    archive: "Arquivar artigo",
                    unpublish: "Retirar do ar",
                    restore: "Recuperar rascunho",
                  }[modal.type]}
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "conflict" && (
        <Modal
          title="Este artigo foi atualizado"
          description="Outra edição foi salva depois que você abriu o artigo. Seu texto continua aqui para você copiá-lo, se precisar."
          onClose={() => setModal(null)}
        >
          <p className="blog-dialog-note">
            Recarregar traz a versão mais recente e descarta as alterações não
            salvas desta tela.
          </p>
          <div className="blog-modal-actions">
            <Button onClick={() => setModal(null)}>Manter meu texto</Button>
            <Button
              variant="primary"
              onClick={() => {
                setModal(null);
                setRetry((value) => value + 1);
              }}
            >
              Recarregar artigo
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "assets" && (
        <Modal
          title="Escolher capa"
          description="Selecione uma imagem da biblioteca do Nexo."
          wide
          onClose={() => setModal(null)}
        >
          {assetLoading ? (
            <Loading label="Carregando imagens…" />
          ) : assets.length ? (
            <div className="blog-asset-grid">
              {assets.map((asset) => (
                <button
                  type="button"
                  key={asset.id || asset.url}
                  onClick={() => {
                    patch({ coverImage: asset.url });
                    setModal(null);
                  }}
                >
                  <img src={asset.url} alt="" loading="lazy" />
                  <span>
                    {asset.name || asset.filename || "Imagem da biblioteca"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={ImageIcon}
              title="A biblioteca ainda não tem imagens"
              description="Envie uma imagem na área de capa para adicioná-la ao artigo."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
