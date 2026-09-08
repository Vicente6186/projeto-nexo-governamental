import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Monitor,
  Plus,
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
import CategoryManager from "./CategoryManager";
import { CATEGORIES, validatePost } from "../../shared/blog.cjs";
import { useDraftRecovery } from "./useDraftRecovery";
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
import { FormSteps, focusStep } from "./FormSteps";
import "./blog-steps.css";
const RichTextEditor = lazy(() => import("./RichTextEditor"));

const STATUS_TABS = [
  { id: "all", label: "Todos" },
  { id: "draft", label: "Rascunhos" },
  { id: "published", label: "Publicados" },
  { id: "pending", label: "Alterações" },
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
  if (post.hasChanges ?? !equivalent(post.draft, post.published))
    return { label: "Alterações em rascunho", tone: "amber" };
  return { label: "Publicado", tone: "green" };
}

const FIELD_LABELS = {
  title: "Título",
  excerpt: "Resumo",
  author: "Autoria",
  authorRole: "Descrição da autoria",
  category: "Categoria",
  body: "Texto do artigo",
  slug: "Endereço do artigo",
  tags: "Temas",
  coverImage: "Imagem de capa",
  coverAlt: "Descrição da imagem",
  coverCredit: "Crédito da imagem",
  featured: "Destaque",
};
function errorField(error) {
  if (error.field && error.field !== "version") return error.field;
  const label = String(error.message || "").split(":")[0];
  return {
    Título: "title",
    Resumo: "excerpt",
    Autoria: "author",
    Categoria: "category",
    Texto: "body",
    Endereço: "slug",
    "Palavras-chave": "tags",
    "Palavra-chave": "tags",
    "Imagem de capa": "coverImage",
    "Descrição da imagem": "coverAlt",
    "Crédito da imagem": "coverCredit",
  }[label];
}
function validationErrors(
  content,
  publishing = false,
  categories = CATEGORIES,
) {
  const result = {};
  if (!content) return result;
  if (publishing) {
    [
      "title",
      "excerpt",
      "author",
      "category",
      "body",
      "slug",
      ...(content.coverImage ? ["coverAlt"] : []),
    ].forEach((field) => {
      if (!String(content[field] || "").trim())
        result[field] =
          `Preencha ${FIELD_LABELS[field].toLocaleLowerCase("pt-BR")} antes de publicar.`;
    });
  }
  try {
    validatePost(content, {
      publishing,
      categories: categories.map(categoryValue),
    });
  } catch (error) {
    result[errorField(error) || "body"] = error.message;
  }
  return result;
}
function downloadCopy(content) {
  const text = `# ${content.title || "Artigo sem título"}\n\n${content.excerpt || ""}\n\n${content.body || ""}\n\n---\n\nDados completos para recuperação:\n\n\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\`\n`;
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(content.title) || "rascunho-nexo"}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function compareRecovery(copy, current, preserveSlug = false) {
  const merged = structuredClone(current),
    conflicts = [],
    changes = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    if (field === "slug" && preserveSlug) continue;
    const mine = copy.value?.[field],
      theirs = current[field];
    if (equivalent(mine, theirs)) continue;
    if (copy.base && equivalent(mine, copy.base[field])) continue;
    changes.push(field);
    if (copy.base && equivalent(theirs, copy.base[field])) merged[field] = mine;
    else conflicts.push(field);
  }
  return { merged, conflicts, changes };
}
function readableValue(value) {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ") || "Nenhum tema";
  return value || "Não informado";
}
function focusField(field) {
  const element =
    document.querySelector(`[data-blog-field="${field}"]`) ||
    document.querySelector(
      field === "body"
        ? '#blog-body, [contenteditable="true"]'
        : `#blog-${field}`,
    );
  let parent = element?.parentElement;
  while (parent) {
    if (parent.tagName === "DETAILS") parent.open = true;
    parent = parent.parentElement;
  }
  if (!element?.getClientRects().length) return false;
  element.focus();
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

export default function BlogWorkspace({
  route = "blog",
  session,
  mediaAssets = [],
  notify,
  onSessionExpired,
  onDirtyChange,
}) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      id: "info",
      label: "Informações",
      title: "Dados do artigo",
      description: "Título, resumo e quem assina o texto.",
    },
    {
      id: "text",
      label: "Texto",
      title: "Texto",
      description:
        "Concentre-se no texto. Você pode voltar às outras etapas quando precisar.",
    },
    {
      id: "cover",
      label: "Capa",
      title: "Capa",
      description:
        "A imagem é opcional. Se usar uma, inclua uma descrição acessível.",
    },
    {
      id: "review",
      label: "Revisão",
      title: "Revisão",
      description:
        "Confira os dados e abra a prévia para ver como o artigo ficará.",
    },
  ];
  function goStep(next) {
    setFocusRequest(null);
    setStep(next);
    focusStep("blog-step-title");
  }
  function focusBlogField(field) {
    setStep(
      field === "body"
        ? 1
        : field.startsWith("cover")
          ? 2
          : ["tags", "featured", "slug"].includes(field)
            ? 3
            : 0,
    );
    setFocusRequest({ field });
  }
  const [focusRequest, setFocusRequest] = useState(null);
  useEffect(() => {
    if (!focusRequest) return;
    let observer;
    const frame = requestAnimationFrame(() => {
      if (focusField(focusRequest.field)) return;
      const heading = document.getElementById("blog-step-title");
      heading?.focus({ preventScroll: true });
      const layout = document.querySelector(".blog-editor-layout");
      if (!layout) return;
      observer = new MutationObserver(() => {
        if (
          document.activeElement !== heading ||
          focusField(focusRequest.field)
        )
          observer.disconnect();
      });
      observer.observe(layout, { childList: true, subtree: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [focusRequest]);
  const postId = route.startsWith("blog/") ? route.slice(5) : null;
  const [posts, setPosts] = useState([]),
    [categories, setCategories] = useState(CATEGORIES);
  const [categoryRevision, setCategoryRevision] = useState(0);
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
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  const [page, setPage] = useState(1),
    [pagination, setPagination] = useState({ total: 0, pages: 1, counts: {} });
  const [listLoading, setListLoading] = useState(false);
  const [errors, setErrors] = useState({}),
    [autosaveFailed, setAutosaveFailed] = useState(false);
  const [connectionOnline, setConnectionOnline] = useState(navigator.onLine);
  const [assetQuery, setAssetQuery] = useState(""),
    [assetError, setAssetError] = useState("");
  const [uploadError, setUploadError] = useState(""),
    [coverReview, setCoverReview] = useState(false);
  const [coverError, setCoverError] = useState(false),
    [coverRetry, setCoverRetry] = useState(0);
  const [revisions, setRevisions] = useState([]),
    [revisionLoading, setRevisionLoading] = useState(false);
  const [modal, setModal] = useState(null),
    [preview, setPreview] = useState(null),
    [previewMobile, setPreviewMobile] = useState(false);
  const [assets, setAssets] = useState([]),
    [assetLoading, setAssetLoading] = useState(false),
    [uploading, setUploading] = useState(false);
  const fileRef = useRef(null),
    draftRef = useRef(draft),
    recordRef = useRef(record);
  const activeId = useRef(postId),
    saveRef = useRef(null),
    operationRef = useRef(false),
    uploadRef = useRef(false),
    uploadController = useRef(null),
    lastUpload = useRef(null);
  activeId.current = postId;
  draftRef.current = draft;
  recordRef.current = record;
  const dirty = !!(
    postId &&
    record &&
    draft &&
    !equivalent(draft, record.draft)
  );
  const hasPublicationChanges =
    !!draft && (!record?.published || !equivalent(draft, record.published));
  const recovery = useDraftRecovery({
    key: `blog:${session?.user?.id || session?.user?.email || session?.email || "local"}:${postId || "list"}`,
    value: draft,
    version: record?.version,
    base: record?.draft,
    dirty,
    ready: !!postId && record?.id === postId && !loading,
  });
  const locked =
    (!!busy && busy !== "autosave") ||
    !!record?.archived ||
    !!recovery.recovery;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function fail(error, { automatic = false } = {}) {
    const field = errorField(error);
    if (
      field &&
      error.submittedPost &&
      !equivalent(error.submittedPost[field], draftRef.current?.[field])
    ) {
      setAutosaveFailed(false);
      return;
    }
    setAutosaveFailed(true);
    if (error.status === 401) {
      onSessionExpired?.();
      return;
    }
    if (field) {
      setErrors((current) => ({
        ...current,
        [field]:
          error.code === "SLUG_TAKEN"
            ? "Este endereço já está em uso. Escolha outro para este artigo."
            : error.message,
      }));
      if (!automatic) focusBlogField(field);
    }
    if (error.code === "VERSION_CONFLICT" || (error.status === 409 && !field)) {
      setAutosaveFailed(true);
      setModal({ type: "conflict" });
    }
    if (automatic) {
      setAutosaveFailed(true);
      return;
    }
    notify?.(
      error.message || "Não foi possível concluir. Tente novamente.",
      true,
    );
  }
  function accept(post, { preserve = false, submitted = null } = {}) {
    setPosts((current) => [
      post,
      ...current.filter((item) => item.id !== post.id),
    ]);
    if (activeId.current === post.id) {
      const keepEditing =
        preserve || (submitted && !equivalent(draftRef.current, submitted));
      const nextDraft = keepEditing
        ? draftRef.current
        : structuredClone(post.draft);
      setRecord(post);
      setDraft(nextDraft);
      // Autosave responses must not replace a newer local URL choice or a
      // trailing comma the author is using to enter the next tag.
      if (!equivalent(nextDraft.tags, draftRef.current?.tags))
        setTagsText((nextDraft.tags || []).join(", "));
      if (!keepEditing)
        setSlugManual(
          !!post.published || post.draft.slug !== slugify(post.draft.title),
        );
      recordRef.current = post;
      draftRef.current = nextDraft;
    }
    return post;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setStep(0);
    setFocusRequest(null);
    setLoadError("");
    setModal(null);
    setPreview(null);
    setRecord(null);
    setDraft(null);
    setErrors({});
    setAutosaveFailed(false);
    setCoverReview(false);
    setCoverError(false);
    setUploadError("");
    onDirtyChange?.(false);
    async function load() {
      try {
        if (postId) {
          const detail = await api(
            `/api/admin/blog/${encodeURIComponent(postId)}`,
          );
          if (!active) return;
          setCategories(detail.categories || CATEGORIES);
          accept(detail.post);
          requestAnimationFrame(() =>
            document.querySelector(".blog-editor-title")?.focus(),
          );
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
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (postId) return;
    let active = true;
    setListLoading(true);
    setLoadError("");
    const params = new URLSearchParams({
      summary: "1",
      page: String(page),
      search,
      status,
      category,
    });
    api(`/api/admin/blog?${params}`)
      .then((result) => {
        if (!active) return;
        setPosts(result.posts || []);
        setCategories(result.categories || CATEGORIES);
        setPagination({
          total: result.total,
          pages: result.pages || 1,
          counts: result.counts || {},
        });
        if (page > (result.pages || 1)) setPage(result.pages || 1);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error.message);
          if (error.status === 401) onSessionExpired?.();
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, retry, page, search, status, category, categoryRevision]);
  useEffect(() => {
    const online = () => {
      setConnectionOnline(true);
      setAutosaveFailed(false);
    };
    const offline = () => setConnectionOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      uploadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (
      !dirty ||
      busy ||
      uploading ||
      record?.archived ||
      autosaveFailed ||
      recovery.recovery ||
      modal ||
      !connectionOnline ||
      Object.keys(validationErrors(draft, false, categories)).length
    )
      return;
    const timer = setTimeout(() => save(true), 1500);
    return () => clearTimeout(timer);
  }, [
    draft,
    dirty,
    busy,
    uploading,
    record?.archived,
    autosaveFailed,
    connectionOnline,
    recovery.recovery,
    modal,
  ]);
  useEffect(() => {
    setAutosaveFailed(false);
  }, [session]);

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
    const next = { ...draftRef.current, ...values };
    draftRef.current = next;
    setDraft(next);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !(key in values)),
      ),
    );
    setAutosaveFailed(false);
  }
  function recoverEditing() {
    const copy = recovery.recovery;
    if (!copy?.value) return;
    if (copy.version !== recordRef.current.version) {
      const comparison = compareRecovery(
        copy,
        recordRef.current.draft,
        !!recordRef.current.published,
      );
      setModal({ type: "recover", copy, comparison, choices: {} });
      return;
    }
    applyRecovered(copy.value);
  }
  function applyRecovered(value) {
    if (recordRef.current.published)
      value = { ...value, slug: recordRef.current.draft.slug };
    recovery.restore();
    patch(value);
    setTagsText((value.tags || []).join(", "));
    setAutosaveFailed(true);
    setModal(null);
    notify?.(
      "Edição recuperada. Confira os campos e salve quando estiver pronto.",
    );
  }
  function changeTitle(title) {
    patch({
      title,
      ...(!slugManual && !record?.published ? { slug: slugify(title) } : {}),
    });
  }
  async function saveCurrent() {
    if (uploadRef.current)
      throw new Error(
        "Aguarde o envio da capa terminar antes de salvar ou publicar.",
      );
    const current = recordRef.current,
      content = draftRef.current;
    if (!current || !content || current.archived) return current;
    if (equivalent(content, current.draft)) return current;
    const invalid = validationErrors(content, false, categories);
    if (Object.keys(invalid).length) {
      const field = Object.keys(invalid)[0];
      setErrors(invalid);
      const error = new Error(invalid[field]);
      error.field = field;
      throw error;
    }
    let result;
    try {
      result = await api(`/api/admin/blog/${current.id}`, {
        method: "PUT",
        body: { post: content, version: current.version },
      });
    } catch (error) {
      error.submittedPost = content;
      throw error;
    }
    setErrors((currentErrors) =>
      Object.fromEntries(
        Object.entries(currentErrors).filter(
          ([field]) => !equivalent(content[field], draftRef.current[field]),
        ),
      ),
    );
    return accept(result.post, { submitted: content });
  }
  async function save(automatic = false) {
    if (
      operationRef.current ||
      modal?.type === "categories" ||
      uploadRef.current ||
      !dirty ||
      recordRef.current?.archived
    )
      return;
    operationRef.current = true;
    setBusy(automatic ? "autosave" : "save");
    try {
      await saveCurrent();
      setAutosaveFailed(false);
      if (!automatic) notify?.("Rascunho do artigo salvo.");
    } catch (error) {
      fail(error, { automatic });
    } finally {
      setBusy("");
      operationRef.current = false;
    }
  }
  saveRef.current = () => save(false);
  async function openCategories() {
    if (operationRef.current || uploadRef.current) return;
    operationRef.current = true;
    setBusy("categories");
    try {
      if (postId && !recordRef.current?.archived) {
        await saveCurrent();
        if (!equivalent(draftRef.current, recordRef.current.draft))
          await saveCurrent();
      }
      setModal({ type: "categories" });
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
      operationRef.current = false;
    }
  }
  function categoriesChanged(result) {
    setCategories(result.categories.map((item) => item.name));
    if (result.change)
      setCategory((value) =>
        value === result.change.from ? result.change.to || "" : value,
      );
    setCategoryRevision((value) => value + 1);
  }
  async function closeCategories() {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy("categories");
    try {
      if (postId) {
        const result = await api(
          `/api/admin/blog/${encodeURIComponent(postId)}`,
        );
        setCategories(result.categories || CATEGORIES);
        accept(result.post);
        setErrors({});
        setAutosaveFailed(false);
      }
      setModal(null);
    } catch (error) {
      notify?.(error.message, true);
      if (error.status === 401) onSessionExpired?.();
    } finally {
      setBusy("");
      operationRef.current = false;
    }
  }
  async function create() {
    if (operationRef.current || uploadRef.current) return;
    operationRef.current = true;
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
      operationRef.current = false;
    }
  }
  async function showPreview(post = record) {
    if (operationRef.current || uploadRef.current || !post) return;
    operationRef.current = true;
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
      operationRef.current = false;
    }
  }
  async function runAction(action) {
    if (operationRef.current || uploadRef.current || !record) return;
    if (action === "publish") {
      const invalid = validationErrors(draftRef.current, true, categories);
      if (Object.keys(invalid).length) {
        setErrors(invalid);
        setModal(null);
        focusBlogField(Object.keys(invalid)[0]);
        return;
      }
      if (!hasPublicationChanges) return;
    }
    operationRef.current = true;
    setBusy(action);
    try {
      const preserve =
        action === "unpublish" || action === "archive" || action === "restore";
      if (preserve && dirty) recovery.persist();
      const current =
        action === "publish" ? await saveCurrent() : recordRef.current;
      const result = await api(`/api/admin/blog/${current.id}/${action}`, {
        method: "POST",
        body: { version: current.version },
      });
      accept(result.post, { preserve: preserve && dirty });
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
      operationRef.current = false;
    }
  }
  async function openAssets() {
    setModal({ type: "assets" });
    setAssetLoading(true);
    setAssetQuery("");
    setAssetError("");
    try {
      const result = await api("/api/admin/assets");
      setAssets(
        Array.from(
          new Map(
            [...(result.assets || []), ...mediaAssets].map((asset) => [
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
      setAssetError(error.message);
      if (error.status === 401) onSessionExpired?.();
    } finally {
      setAssetLoading(false);
    }
  }
  async function uploadCover(file) {
    if (!file || uploadRef.current || operationRef.current) return;
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
      notify?.("Escolha uma imagem JPG, PNG, WebP ou AVIF.", true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify?.("A imagem deve ter até 8 MB.", true);
      return;
    }
    const startingPost = activeId.current;
    lastUpload.current = file;
    uploadRef.current = true;
    uploadController.current = new AbortController();
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/admin/uploads", {
        method: "POST",
        form,
        signal: uploadController.current.signal,
      });
      if (activeId.current === startingPost) selectCover(result.asset.url);
      setAssets((current) => [result.asset, ...current]);
      notify?.(
        activeId.current === startingPost
          ? "Capa adicionada. Confira a descrição e o crédito desta imagem."
          : "Imagem enviada à biblioteca.",
      );
    } catch (error) {
      if (
        error.name === "AbortError" ||
        uploadController.current?.signal.aborted
      ) {
        setUploadError("Envio cancelado. A capa anterior foi mantida.");
      } else {
        setUploadError(
          error.message || "Não foi possível enviar a imagem. Tente novamente.",
        );
        if (error.status === 401) onSessionExpired?.();
      }
    } finally {
      uploadRef.current = false;
      uploadController.current = null;
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function selectCover(coverImage) {
    if (coverImage === draftRef.current?.coverImage) return;
    patch({ coverImage, coverAlt: "", coverCredit: "" });
    setCoverReview(!!coverImage);
    setCoverError(false);
  }
  async function openRevisions() {
    setModal({ type: "revisions" });
    setRevisionLoading(true);
    try {
      const result = await api(
        `/api/admin/blog/${recordRef.current.id}/revisions`,
      );
      setRevisions(result.revisions || []);
    } catch (error) {
      fail(error);
    } finally {
      setRevisionLoading(false);
    }
  }
  async function inspectRevision(revision) {
    setRevisionLoading(true);
    try {
      const result = await api(
        `/api/admin/blog/${recordRef.current.id}/revisions/${revision.id}`,
      );
      setModal({ type: "revision", revision: result.revision });
    } catch (error) {
      fail(error);
    } finally {
      setRevisionLoading(false);
    }
  }
  async function restoreRevision(revision) {
    if (operationRef.current || uploadRef.current) return;
    operationRef.current = true;
    setBusy("revision");
    try {
      if (dirty) {
        recovery.persist();
        downloadCopy(draftRef.current);
      }
      const result = await api(
        `/api/admin/blog/${recordRef.current.id}/restore-revision`,
        {
          method: "POST",
          body: { revisionId: revision.id, version: recordRef.current.version },
        },
      );
      accept(result.post);
      setModal(null);
      setErrors({});
      setAutosaveFailed(false);
      notify?.(
        "Versão recuperada como rascunho. Confira a prévia antes de publicar.",
      );
    } catch (error) {
      fail(error);
    } finally {
      operationRef.current = false;
      setBusy("");
    }
  }
  const filtered = posts;
  const publicationErrors = {
    ...validationErrors(draft, true, categories),
    ...errors,
  };
  const requirements = Object.entries(publicationErrors).map(
    ([field, message]) => ({
      field,
      label: FIELD_LABELS[field] || field,
      message,
      valid: false,
    }),
  );
  const ready = requirements.length === 0 && !coverError;
  const changedFields = draft
    ? Object.keys(FIELD_LABELS).filter(
        (field) => !equivalent(draft[field], record?.published?.[field]),
      )
    : [];
  const filteredAssets = assets.filter((asset) =>
    normalize([asset.name, asset.filename, asset.type].join(" ")).includes(
      normalize(assetQuery.trim()),
    ),
  );

  if (loading)
    return (
      <Loading
        compact
        label={postId ? "Abrindo o artigo…" : "Carregando o blog…"}
      />
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
      {modal?.type === "categories" && (
        <CategoryManager
          onChange={categoriesChanged}
          onClose={closeCategories}
          onSessionExpired={onSessionExpired}
          closing={busy === "categories"}
        />
      )}
      {!postId ? (
        <>
          <div className="blog-list-intro">
            <h1>Blog do Nexo</h1>
            <div className="blog-inline-actions">
              <Button
                icon={Settings2}
                onClick={openCategories}
                disabled={!!busy}
              >
                Gerenciar categorias
              </Button>
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
              <span>Prévia local · rascunhos</span>
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
                onChange={(next) => {
                  setStatus(next);
                  setPage(1);
                }}
                tabs={STATUS_TABS.map((tab) => ({
                  ...tab,
                  label: (
                    <>
                      {tab.label}{" "}
                      <span className="blog-tab-count">
                        {pagination.counts[tab.id] ?? 0}
                      </span>
                    </>
                  ),
                }))}
                panelId="blog-posts-panel"
              />
              <label className="blog-search">
                <Search size={17} />
                <span className="sr-only">Buscar artigos</span>
                <input
                  placeholder="Buscar artigos…"
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
            <div className="blog-list-filters">
              <label htmlFor="blog-filter-category">Categoria</label>
              <select
                id="blog-filter-category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas as categorias</option>
                {categories.map((item) => (
                  <option key={categoryValue(item)} value={categoryValue(item)}>
                    {categoryLabel(item)}
                  </option>
                ))}
              </select>
              {status === "pending" && <p>Alterações ainda não publicadas.</p>}
              {listLoading && (
                <span role="status" className="blog-list-updating">
                  <LoaderCircle size={15} /> Atualizando…
                </span>
              )}
            </div>
            <div
              role="tabpanel"
              id="blog-posts-panel"
              aria-labelledby={`blog-posts-panel-tab-${status}`}
              tabIndex={0}
              aria-busy={listLoading}
            >
              {listLoading && filtered.length === 0 ? (
                <Loading compact label="Carregando artigos…" />
              ) : filtered.length > 0 ? (
                <>
                  <div className="blog-table-heading">
                    <span>
                      {pagination.total}{" "}
                      {pagination.total === 1 ? "artigo" : "artigos"}
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
                                {post.readingMinutes ||
                                  minutes(content.body)}{" "}
                                min de leitura
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
                        : status === "pending"
                          ? "Publicações em dia"
                          : status === "published"
                            ? "O próximo artigo começa aqui"
                            : "Um espaço para boas ideias"
                  }
                  description={
                    query
                      ? "Tente outro título, autor ou tema."
                      : status === "archived"
                        ? "Artigos arquivados ficam guardados aqui e podem ser recuperados."
                        : status === "pending"
                          ? "Nenhum artigo publicado tem alterações de rascunho aguardando publicação."
                          : status === "published"
                            ? "Os artigos aparecem no blog depois que você os publica."
                            : "Crie o primeiro rascunho e transforme o conhecimento do Nexo em leitura."
                  }
                >
                  {query ? (
                    <Button onClick={() => setQuery("")}>Limpar busca</Button>
                  ) : (
                    !["archived", "pending"].includes(status) && (
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
            {pagination.pages > 1 && (
              <nav
                className="blog-pagination"
                aria-label="Paginação dos artigos"
              >
                <Button
                  disabled={page <= 1 || listLoading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {page} de {pagination.pages}
                </span>
                <Button
                  disabled={page >= pagination.pages || listLoading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </Button>
              </nav>
            )}
          </section>
        </>
      ) : (
        <>
          <h1 className="sr-only blog-editor-title" tabIndex={-1}>
            Editar artigo
          </h1>
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
          {recovery.recovery && (
            <div className="blog-recovery-notice" role="status">
              <div>
                <strong>Encontramos uma edição neste navegador.</strong>
                <p>
                  Guardada em {dateLabel(recovery.recovery.savedAt, true)}.
                  Recupere para conferir antes de salvar.
                </p>
              </div>
              <div className="blog-inline-actions">
                <Button variant="primary" onClick={recoverEditing}>
                  Recuperar edição
                </Button>
                <Button onClick={recovery.discard}>
                  Descartar cópia local
                </Button>
              </div>
            </div>
          )}
          {(!connectionOnline || autosaveFailed) && dirty && (
            <div
              className="blog-recovery-notice blog-connection-notice"
              role="status"
            >
              <div>
                <strong>
                  {connectionOnline
                    ? "O rascunho precisa de atenção."
                    : "Você está sem conexão."}
                </strong>
                <p>
                  {connectionOnline
                    ? recovery.available
                      ? "Confira os campos e tente salvar novamente. Sua edição permanece neste navegador."
                      : "Confira os campos e tente salvar novamente. Baixe uma cópia antes de fechar esta tela."
                    : recovery.available
                      ? "Continue escrevendo. O salvamento será retomado quando a conexão voltar."
                      : "Baixe uma cópia antes de fechar esta tela. Este navegador não permitiu guardar sua edição."}
                </p>
              </div>
              <div className="blog-inline-actions">
                <Button
                  onClick={() => save(false)}
                  disabled={
                    !connectionOnline || !!busy || uploading || record.archived
                  }
                >
                  Tentar salvar
                </Button>
                <Button onClick={() => downloadCopy(draftRef.current)}>
                  Baixar cópia
                </Button>
              </div>
            </div>
          )}
          {!recovery.available &&
            dirty &&
            connectionOnline &&
            !autosaveFailed && (
              <div className="blog-recovery-notice" role="status">
                <div>
                  <strong>Guarde uma cópia antes de fechar.</strong>
                  <p>
                    O armazenamento deste navegador não está disponível. Seu
                    texto continua aberto nesta tela.
                  </p>
                </div>
                <Button onClick={() => downloadCopy(draftRef.current)}>
                  Baixar cópia
                </Button>
              </div>
            )}
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
          <FormSteps
            label="Etapas do artigo"
            steps={steps}
            value={step}
            onChange={goStep}
          />
          <header className="form-step-intro">
            <h2 id="blog-step-title" tabIndex={-1}>
              {steps[step].title}
            </h2>
          </header>
          <div className="blog-editor-layout blog-wizard-layout">
            <div className="blog-writing-column">
              <section
                className="card blog-writing-card"
                hidden={step !== 0}
                aria-label="Informações do artigo"
              >
                <fieldset disabled={locked} className="blog-title-fields">
                  <label htmlFor="blog-title" className="blog-section-eyebrow">
                    Título do artigo
                  </label>
                  <textarea
                    id="blog-title"
                    aria-label="Título do artigo"
                    className="blog-title-input"
                    value={draft.title}
                    onChange={(event) => changeTitle(event.target.value)}
                    placeholder="Título do artigo"
                    rows={2}
                    maxLength={180}
                    data-blog-field="title"
                    aria-invalid={!!errors.title}
                    aria-describedby={
                      errors.title ? "blog-title-error" : undefined
                    }
                  />
                  {errors.title && (
                    <p
                      className="field-error"
                      id="blog-title-error"
                      role="alert"
                    >
                      {errors.title}
                    </p>
                  )}
                  <Field
                    label="Resumo"
                    data-blog-field="excerpt"
                    error={errors.excerpt}
                    value={draft.excerpt}
                    onChange={(excerpt) => patch({ excerpt })}
                    multiline
                    maxLength={360}
                    placeholder="Apresente a ideia central em poucas linhas."
                    hint="Usado no blog e no compartilhamento."
                  />
                  <div className="blog-essential-fields">
                    <div className="field">
                      <div className="field-label blog-category-label">
                        <label htmlFor="blog-category">Categoria</label>
                        <Button
                          onClick={openCategories}
                          disabled={!!busy || !!recovery.recovery}
                          aria-label="Gerenciar categorias"
                        >
                          Gerenciar
                        </Button>
                      </div>
                      <select
                        id="blog-category"
                        data-blog-field="category"
                        aria-invalid={!!errors.category}
                        aria-describedby={
                          errors.category ? "blog-category-error" : undefined
                        }
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
                      {errors.category && (
                        <p
                          className="field-error"
                          id="blog-category-error"
                          role="alert"
                        >
                          {errors.category}
                        </p>
                      )}
                    </div>
                    <Field
                      label="Autoria"
                      data-blog-field="author"
                      error={errors.author}
                      value={draft.author}
                      onChange={(author) => patch({ author })}
                      maxLength={160}
                      placeholder="Nome da pessoa ou equipe"
                    />
                  </div>
                  <details className="form-optional">
                    <summary>
                      Sobre a autoria <span>Opcional</span>
                    </summary>
                    <Field
                      label="Descrição da autoria"
                      data-blog-field="authorRole"
                      error={errors.authorRole}
                      value={draft.authorRole}
                      onChange={(authorRole) => patch({ authorRole })}
                      maxLength={180}
                      placeholder="Vínculo, área ou breve apresentação"
                    />
                  </details>
                </fieldset>
              </section>
              <section
                className="card blog-writing-card blog-text-step"
                hidden={step !== 1}
                aria-label="Texto do artigo"
              >
                <div className="blog-body-heading">
                  <div>
                    <span>{minutes(draft.body)} min de leitura</span>
                  </div>
                </div>
                <Suspense
                  fallback={
                    <div className="blog-editor-loading">
                      <Loading compact label="Abrindo editor de texto…" />
                    </div>
                  }
                >
                  <RichTextEditor
                    key={record.id}
                    value={draft.body}
                    onChange={(body) => patch({ body })}
                    disabled={locked}
                    error={errors.body}
                  />
                </Suspense>
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
              <section
                className="card blog-cover-card"
                hidden={step !== 2}
                aria-label="Capa do artigo"
              >
                <div className="blog-card-heading">
                  <div>
                    <h2>Imagem de capa</h2>
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
                          key={`${draft.coverImage}-${coverRetry}`}
                          onError={() => setCoverError(true)}
                          onLoad={() => setCoverError(false)}
                          alt={draft.coverAlt || "Prévia da capa do artigo"}
                        />
                        <button
                          type="button"
                          className="blog-remove-cover"
                          onClick={() => selectCover("")}
                          aria-label="Remover capa"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="blog-cover-placeholder">
                        <ImageIcon size={27} strokeWidth={1.3} />
                        <strong>Adicionar capa</strong>
                        <span>JPG, PNG, WebP ou AVIF · até 8 MB</span>
                      </div>
                    )}
                  </div>
                  {draft.coverImage && (
                    <p className="field-hint blog-cover-crop-note">
                      Imagem horizontal, com o assunto centralizado.
                    </p>
                  )}
                  {coverError && (
                    <div className="blog-cover-warning" role="alert">
                      <AlertCircle size={17} />
                      <p>
                        A imagem não abriu. Confira o link ou escolha outra capa
                        antes de publicar.
                      </p>
                      <Button
                        onClick={() => {
                          setCoverError(false);
                          setCoverRetry((value) => value + 1);
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  )}
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
                      data-blog-field="coverImage"
                      error={errors.coverImage}
                      value={draft.coverImage}
                      onChange={selectCover}
                      placeholder="https://… ou /uploads/…"
                    />
                  </details>
                  {draft.coverImage && (
                    <div className="blog-cover-metadata">
                      {coverReview && (
                        <p className="blog-cover-review">
                          A imagem mudou. Preencha a descrição desta capa e
                          confira se ela precisa de crédito.
                        </p>
                      )}
                      <Field
                        label="Descrição da imagem"
                        data-blog-field="coverAlt"
                        error={errors.coverAlt}
                        value={draft.coverAlt}
                        onChange={(coverAlt) => patch({ coverAlt })}
                        maxLength={300}
                        hint="Descrição para leitores de tela."
                        placeholder="Descreva a cena de forma objetiva."
                      />
                      <Field
                        label="Crédito da imagem"
                        data-blog-field="coverCredit"
                        error={errors.coverCredit}
                        value={draft.coverCredit}
                        onChange={(coverCredit) => patch({ coverCredit })}
                        maxLength={240}
                        placeholder="Autor ou instituição responsável pela imagem"
                      />
                    </div>
                  )}
                </fieldset>
                {uploading && (
                  <div className="blog-upload-status" role="status">
                    <LoaderCircle className="spin" size={17} />
                    <span>Enviando capa… Aguarde para salvar ou publicar.</span>
                    <Button onClick={() => uploadController.current?.abort()}>
                      Cancelar envio
                    </Button>
                  </div>
                )}
                {uploadError && (
                  <div className="blog-upload-status is-error" role="alert">
                    <AlertCircle size={17} />
                    <span>{uploadError}</span>
                    <Button
                      onClick={() => uploadCover(lastUpload.current)}
                      disabled={uploading || !!busy}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}
              </section>
            </div>
            <aside
              className="blog-settings-column"
              hidden={step !== 3}
              aria-label="Configurações do artigo"
            >
              <section
                className="card blog-review-card"
                aria-label="Resumo do artigo"
              >
                {draft.coverImage && (
                  <img
                    src={draft.coverImage}
                    alt={draft.coverAlt || "Capa do artigo"}
                    className="blog-review-image"
                  />
                )}
                <div className="blog-review-content">
                  <span className="blog-review-category">
                    {draft.category || "Categoria a definir"}
                  </span>
                  <h3>{draft.title || "Artigo sem título"}</h3>
                  <p>
                    {draft.excerpt ||
                      "Adicione um resumo na etapa Informações."}
                  </p>
                  <div className="blog-review-byline">
                    {draft.author || "Autoria a definir"} <span>·</span>{" "}
                    {minutes(draft.body)} min de leitura
                  </div>
                </div>
                <div className="blog-review-checks">
                  <strong className={ready ? "blog-review-ready" : undefined}>
                    {ready && <CheckCircle2 size={17} aria-hidden="true" />}
                    {ready
                      ? "Pronto para publicar"
                      : "Confira antes de publicar"}
                  </strong>
                  {requirements.map((item) => (
                    <button
                      key={item.field}
                      type="button"
                      onClick={() => {
                        setErrors(publicationErrors);
                        focusBlogField(item.field);
                      }}
                    >
                      <AlertCircle size={16} /> {item.message}{" "}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                  {coverError && (
                    <button type="button" onClick={() => goStep(2)}>
                      <AlertCircle size={16} /> Confira a imagem de capa{" "}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </section>
              <details className="card blog-settings-card blog-review-options">
                <summary>
                  Ajustes de publicação <ChevronDown size={17} />
                </summary>
                <fieldset disabled={locked}>
                  <Field
                    label="Temas"
                    data-blog-field="tags"
                    error={errors.tags}
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
                    hint="Até 8 temas, separados por vírgulas."
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
              </details>
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
                    data-blog-field="slug"
                    error={errors.slug}
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
                  <span>Salvo em</span>
                  <strong>{dateLabel(record.updatedAt, true)}</strong>
                  {record.publishedAt && (
                    <p>Publicado em {dateLabel(record.publishedAt)}</p>
                  )}
                </div>
              </div>
              <Button
                icon={Clock3}
                onClick={openRevisions}
                disabled={!!busy || uploading}
              >
                Versões anteriores
              </Button>
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
              <span aria-live="polite">
                {uploading
                  ? "Enviando capa…"
                  : ["save", "autosave"].includes(busy)
                    ? "Salvando rascunho…"
                    : dirty
                      ? autosaveFailed || !connectionOnline
                        ? recovery.available
                          ? "Edição guardada neste navegador"
                          : "Edição aberta nesta tela"
                        : "Alterações não salvas"
                      : "Rascunho salvo"}
              </span>
            </div>
            <div className="blog-savebar-actions">
              <Button
                icon={Eye}
                onClick={() => showPreview()}
                disabled={!!busy || uploading}
              >
                Prévia
              </Button>
              {!record.archived && (
                <>
                  <Button
                    icon={Save}
                    onClick={() => save(false)}
                    disabled={!!busy || uploading || !dirty}
                  >
                    {busy === "save" ? "Salvando…" : "Salvar rascunho"}
                  </Button>
                  {step > 0 && (
                    <Button icon={ArrowLeft} onClick={() => goStep(step - 1)}>
                      Voltar
                    </Button>
                  )}
                  {step < steps.length - 1 ? (
                    <Button variant="primary" onClick={() => goStep(step + 1)}>
                      {step === 2 && !draft.coverImage
                        ? "Continuar sem capa"
                        : "Continuar"}{" "}
                      <ArrowRight size={16} />
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      icon={Send}
                      onClick={() => {
                        if (!uploadRef.current) setModal({ type: "publish" });
                      }}
                      disabled={!!busy || uploading || !hasPublicationChanges}
                    >
                      {record.published
                        ? "Publicar alterações"
                        : "Publicar artigo"}
                    </Button>
                  )}
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
            {draft.coverImage && (
              <img
                className="blog-publish-cover"
                src={draft.coverImage}
                alt={draft.coverAlt || "Capa a revisar"}
              />
            )}
            <span>{draft.category || "Categoria a definir"}</span>
            <h3>{draft.title || "Artigo sem título"}</h3>
            <p>{draft.excerpt || "Adicione um resumo antes de publicar."}</p>
            <div>
              {draft.author || "Autoria a definir"} <span>·</span>{" "}
              {minutes(draft.body)} min de leitura
            </div>
          </div>
          <div className="blog-change-review">
            <strong>
              {record.published
                ? "O que será atualizado"
                : "Confira os dados da publicação"}
            </strong>
            <dl>
              {changedFields.map((field) => (
                <div key={field}>
                  <dt>{FIELD_LABELS[field]}</dt>
                  <dd>
                    {field === "body"
                      ? `${minutes(draft.body)} min de leitura · ${
                          String(draft.body || "")
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean).length
                        } palavras`
                      : field === "featured"
                        ? draft.featured
                          ? "Em destaque"
                          : "Sem destaque"
                        : field === "coverImage"
                          ? draft.coverImage
                            ? "Capa exibida acima"
                            : "Sem capa"
                          : Array.isArray(draft[field])
                            ? draft[field].join(", ") || "Nenhum tema"
                            : draft[field] || "Não informado"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {!ready && (
            <div className="blog-publish-requirements">
              <strong>Complete antes de publicar</strong>
              {requirements
                .filter((item) => !item.valid)
                .map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => {
                      setErrors(publicationErrors);
                      setModal(null);
                      focusBlogField(item.field);
                    }}
                  >
                    <AlertCircle size={14} /> {item.label}
                  </button>
                ))}
            </div>
          )}
          {coverError && (
            <p className="field-error">
              A capa precisa abrir corretamente antes de publicar.
            </p>
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
              disabled={!!busy || uploading || !ready || !hasPublicationChanges}
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
              As alterações desta tela permanecem no navegador. Esta ação usa a
              versão salva e pode ser concluída mesmo se houver campos
              incompletos.
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
      {modal?.type === "recover" && (
        <Modal
          title="Revisar edição recuperada"
          description="O artigo recebeu alterações desde que esta cópia foi guardada. Confira quais informações deseja recuperar."
          wide
          onClose={() => setModal(null)}
        >
          {modal.comparison.conflicts.length ? (
            <div className="blog-recovery-conflicts">
              <p className="blog-dialog-note">
                Escolha uma versão para cada campo abaixo. Os demais campos
                mantêm as alterações de cada edição.
              </p>
              {modal.comparison.conflicts.map((field) => (
                <fieldset key={field}>
                  <legend>{FIELD_LABELS[field]}</legend>
                  <div className="blog-conflict-comparison">
                    {[
                      {
                        id: "theirs",
                        label: "Última versão salva",
                        value: record.draft[field],
                      },
                      {
                        id: "mine",
                        label: "Sua cópia neste navegador",
                        value: modal.copy.value[field],
                      },
                    ].map((choice) => (
                      <label
                        key={choice.id}
                        className={
                          modal.choices[field] === choice.id
                            ? "is-selected"
                            : ""
                        }
                      >
                        <span>
                          <input
                            type="radio"
                            name={`recover-${field}`}
                            checked={modal.choices[field] === choice.id}
                            onChange={() =>
                              setModal((current) => ({
                                ...current,
                                choices: {
                                  ...current.choices,
                                  [field]: choice.id,
                                },
                              }))
                            }
                          />
                          {choice.label}
                        </span>
                        <pre>{readableValue(choice.value)}</pre>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : (
            <p className="blog-dialog-note">
              As duas edições alteraram campos diferentes. É possível recuperar
              sua cópia preservando todas as alterações que já foram salvas.
            </p>
          )}
          {modal.comparison.changes.length > 0 && (
            <p className="blog-dialog-note">
              Campos da sua cópia:{" "}
              {modal.comparison.changes
                .map((field) => FIELD_LABELS[field])
                .join(", ")}
              .
            </p>
          )}
          {record.published && (
            <p className="field-hint">
              O endereço do artigo publicado será mantido para preservar os
              links compartilhados.
            </p>
          )}
          <div className="blog-modal-actions">
            <Button onClick={() => setModal(null)}>Voltar sem alterar</Button>
            <Button onClick={() => downloadCopy(modal.copy.value)}>
              Baixar cópia local
            </Button>
            <Button
              variant="primary"
              disabled={modal.comparison.conflicts.some(
                (field) => !modal.choices[field],
              )}
              onClick={() => {
                const merged = { ...modal.comparison.merged };
                for (const field of modal.comparison.conflicts)
                  merged[field] =
                    modal.choices[field] === "mine"
                      ? modal.copy.value[field]
                      : recordRef.current.draft[field];
                applyRecovered(merged);
              }}
            >
              Aplicar edição revisada
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "conflict" && (
        <Modal
          title="Este artigo foi atualizado"
          description="Outra edição foi salva depois que você abriu o artigo. Sua edição continua preservada neste navegador."
          onClose={() => setModal(null)}
        >
          <p className="blog-dialog-note">
            Você pode baixar uma cópia completa do seu texto antes de abrir a
            versão atual do servidor. Nenhuma edição será publicada
            automaticamente.
          </p>
          {modal.latest && (
            <div className="blog-conflict-comparison">
              <section>
                <h3>Sua edição</h3>
                <strong>{draft.title || "Sem título"}</strong>
                <p>{draft.excerpt}</p>
                <p>{minutes(draft.body)} min de leitura</p>
              </section>
              <section>
                <h3>Última versão salva</h3>
                <strong>{modal.latest.draft.title || "Sem título"}</strong>
                <p>{modal.latest.draft.excerpt}</p>
                <p>{dateLabel(modal.latest.updatedAt, true)}</p>
              </section>
            </div>
          )}
          <div className="blog-modal-actions">
            <Button onClick={() => setModal(null)}>Manter meu texto</Button>
            <Button onClick={() => downloadCopy(draftRef.current)}>
              Baixar cópia
            </Button>
            {!modal.latest && (
              <Button
                onClick={async () => {
                  try {
                    const latest = await api(
                      `/api/admin/blog/${recordRef.current.id}`,
                    );
                    setModal({ type: "conflict", latest: latest.post });
                  } catch (error) {
                    notify?.(error.message, true);
                  }
                }}
              >
                Comparar versões
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                recovery.persist();
                if (dirty) downloadCopy(draftRef.current);
                setModal(null);
                setRetry((value) => value + 1);
              }}
            >
              Baixar minha cópia e recarregar
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "revisions" && (
        <Modal
          title="Histórico do artigo"
          description="Versões guardadas automaticamente. Recuperar uma versão altera somente o rascunho."
          onClose={() => setModal(null)}
        >
          {revisionLoading ? (
            <Loading compact label="Carregando versões…" />
          ) : revisions.length ? (
            <div className="blog-revision-list">
              {revisions.map((revision) => (
                <article key={revision.id} data-revision-id={revision.id}>
                  <div>
                    <Badge
                      tone={
                        revision.source === "published" ? "green" : "neutral"
                      }
                    >
                      {revision.source === "published"
                        ? "Publicação"
                        : "Rascunho"}
                    </Badge>
                    <strong>{revision.title || "Artigo sem título"}</strong>
                    <p>
                      {dateLabel(revision.createdAt, true)}
                      {revision.actor ? ` · ${revision.actor}` : ""}
                    </p>
                  </div>
                  <Button onClick={() => inspectRevision(revision)}>
                    Ver versão
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={Clock3}
              title="Nenhuma versão anterior"
              description="As próximas alterações e publicações serão guardadas aqui."
            />
          )}
        </Modal>
      )}
      {modal?.type === "revision" && (
        <Modal
          title="Conferir versão anterior"
          description={`${modal.revision.source === "published" ? "Publicação" : "Rascunho"} de ${dateLabel(modal.revision.createdAt, true)}.`}
          wide
          onClose={() => setModal(null)}
        >
          <div className="blog-revision-preview">
            <h3>{modal.revision.post.title || "Artigo sem título"}</h3>
            <p>{modal.revision.post.excerpt}</p>
            <p className="field-hint">
              {modal.revision.post.author} · {modal.revision.post.category}
            </p>
            {modal.revision.post.coverImage && (
              <img
                src={modal.revision.post.coverImage}
                alt={modal.revision.post.coverAlt || "Capa desta versão"}
              />
            )}
            <pre>{modal.revision.post.body}</pre>
          </div>
          {!categories
            .map(categoryValue)
            .includes(modal.revision.post.category) && (
            <p className="blog-dialog-note">
              A categoria desta versão não existe mais. A categoria atual do
              artigo será mantida.
            </p>
          )}
          {record.archived && (
            <p className="blog-dialog-note">
              Recupere o artigo arquivado para restaurar esta versão.
            </p>
          )}
          {dirty && (
            <p className="blog-dialog-note">
              Sua edição atual será baixada como cópia antes da restauração.
            </p>
          )}
          <div className="blog-modal-actions">
            <Button onClick={openRevisions}>Voltar às versões</Button>
            <Button onClick={() => downloadCopy(modal.revision.post)}>
              Baixar versão
            </Button>
            <Button
              variant="primary"
              onClick={() => restoreRevision(modal.revision)}
              disabled={!!busy || uploading || record.archived}
            >
              Restaurar este rascunho
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
          <label className="blog-search blog-asset-search">
            <Search size={17} />
            <span className="sr-only">Buscar imagens</span>
            <input
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder="Buscar imagem pelo nome…"
            />
          </label>
          <p className="field-hint">
            Imagens enviadas recentemente aparecem primeiro. A capa atual fica
            marcada.
          </p>
          {assetError ? (
            <div className="blog-upload-status is-error" role="alert">
              <span>{assetError}</span>
              <Button onClick={openAssets}>Tentar novamente</Button>
            </div>
          ) : assetLoading ? (
            <Loading compact label="Carregando imagens…" />
          ) : filteredAssets.length ? (
            <div className="blog-asset-grid">
              {filteredAssets.map((asset) => (
                <button
                  type="button"
                  key={asset.id || asset.url}
                  className={
                    asset.url === draft.coverImage ? "is-selected" : ""
                  }
                  aria-pressed={asset.url === draft.coverImage}
                  onClick={() => {
                    selectCover(asset.url);
                    setModal(null);
                  }}
                >
                  <img src={asset.url} alt="" loading="lazy" />
                  <span>
                    {asset.name || asset.filename || "Imagem da biblioteca"}
                  </span>
                  <small>
                    {asset.url === draft.coverImage ? "Capa atual · " : ""}
                    {asset.width && asset.height
                      ? `${asset.width} × ${asset.height} · `
                      : ""}
                    {asset.size
                      ? `${Math.max(1, Math.round(asset.size / 1024))} KB`
                      : "Imagem do Nexo"}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={ImageIcon}
              title={
                assetQuery
                  ? "Nenhuma imagem encontrada"
                  : "A biblioteca ainda não tem imagens"
              }
              description={
                assetQuery
                  ? "Tente outro nome ou limpe a busca."
                  : "Envie uma imagem na área de capa para adicioná-la ao artigo."
              }
            />
          )}
        </Modal>
      )}
    </div>
  );
}
