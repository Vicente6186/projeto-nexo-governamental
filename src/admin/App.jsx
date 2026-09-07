import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  LayoutDashboard,
  PanelsTopLeft,
  CalendarDays,
  Images,
  History,
  Settings2,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Search,
  Globe,
  Plus,
  Check,
  CheckCheck,
  Save,
  Upload,
  FileText,
  Eye,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Trash2,
  Info,
  AlertCircle,
  CheckCircle2,
  Link2,
  Mail,
  Clock3,
  LoaderCircle,
  Monitor,
  Smartphone,
  FolderOpen,
  Copy,
  LockKeyhole,
} from "lucide-react";
import {
  Button,
  Tabs,
  Badge,
  Field,
  Toggle,
  Modal,
  Empty,
  Loading,
  CardHeading,
  AssetField,
  LABELS,
  dateLabel,
  dayLabel,
  effectiveStatus,
  bytesLabel,
} from "./components";
import { api, setCsrf } from "./api";
import ThemeMenu from "./ThemeMenu";
import { FIELD_LABELS } from "../../shared/content.cjs";

const BlogWorkspace = lazy(() => import("./BlogWorkspace"));

const NAV = [
  { id: "inicio", label: "Visão geral", icon: LayoutDashboard },
  { id: "conteudo", label: "Conteúdo do site", icon: PanelsTopLeft },
  { id: "blog", label: "Blog do Nexo", icon: BookOpen },
  { id: "processo", label: "Processo seletivo", icon: CalendarDays },
  { id: "midia", label: "Biblioteca de mídia", icon: Images },
  { id: "historico", label: "Histórico de versões", icon: History },
];
const PHOTOS = {
  introduction: "/assets/introduction/usp-560.avif",
  about: "/assets/brand-with-background.webp",
  objective: "/assets/more/travel-480.avif",
  recognize: "/assets/politicians/presidente.avif",
  "selective-process": "/assets/selective-process.avif",
  more: "/assets/more/events-480.avif",
  instagram: "/assets/brand-with-background.webp",
  contact: "/assets/introduction/usp-560.avif",
};
const INITIAL_ASSETS = [
  {
    id: "usp",
    name: "Faculdade de Direito · USP",
    url: PHOTOS.introduction,
    type: "image/avif",
    size: 0,
  },
  {
    id: "brand",
    name: "Identidade Nexo Governamental",
    url: PHOTOS.about,
    type: "image/webp",
    size: 0,
  },
  {
    id: "school",
    name: "Nexo nas Escolas",
    url: "/assets/more/school.webp",
    type: "image/webp",
    size: 0,
  },
  {
    id: "events",
    name: "Encontros e eventos",
    url: "/assets/more/events.webp",
    type: "image/webp",
    size: 0,
  },
  {
    id: "travel",
    name: "Viagens e instituições",
    url: "/assets/more/travel.webp",
    type: "image/webp",
    size: 0,
  },
  {
    id: "schedule",
    name: "Cronograma original",
    url: "/assets/selective-process.avif",
    type: "image/avif",
    size: 0,
  },
  {
    id: "president",
    name: "Encontro · Presidente da República",
    url: PHOTOS.recognize,
    type: "image/avif",
    size: 0,
  },
  ...[
    [
      "vice",
      "Encontro · Vice-presidente e Ministro",
      "/assets/politicians/vice-presidente-ministro.avif",
    ],
    [
      "senate",
      "Encontro · Presidente do Senado",
      "/assets/politicians/presidente-do-senado.avif",
    ],
    [
      "labor",
      "Encontro · Ministro do Trabalho",
      "/assets/politicians/ministro-do-trabalho.avif",
    ],
    ["deputies", "Encontro · Deputados", "/assets/politicians/deputados.avif"],
    ["justice", "Arquitetura · Justiça", "/assets/parallax/justice-1920.avif"],
    ["university", "Arquitetura · USP", "/assets/parallax/usp.avif"],
  ].map(([id, name, url]) => ({ id, name, url, type: "image/avif", size: 0 })),
];
const ACTIONS = {
  "draft.saved": "Rascunho salvo",
  published: "Conteúdo publicado",
  "draft.restored": "Versão restaurada",
  initialized: "Conteúdo inicial",
  save: "Rascunho salvo",
  draft: "Rascunho salvo",
  publish: "Conteúdo publicado",
  restore: "Versão restaurada",
  upload: "Arquivo adicionado",
  initial: "Conteúdo inicial",
  seed: "Conteúdo inicial",
};
function routeFromHash() {
  try {
    const route = decodeURIComponent(window.location.hash.slice(1));
    if (route === "secao/selective-process") return "processo";
    return /^(inicio|conteudo|processo|midia|historico|configuracoes|blog(?:\/[a-f0-9-]+)?|secao\/[a-z-]+)$/.test(
      route,
    )
      ? route
      : "inicio";
  } catch {
    return "inicio";
  }
}
function Brand() {
  return (
    <div className="brand">
      <img src="/assets/introduction/brand-without-background.webp" alt="" />
      <div>
        <strong>
          nexo<span> studio</span>
        </strong>
        <small>NEXO GOVERNAMENTAL</small>
      </div>
    </div>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [state, setState] = useState(null),
    [error, setError] = useState("");
  async function boot() {
    setError("");
    try {
      const s = await api("/api/session");
      setSession(s);
      if (s.authenticated) {
        setState(await api("/api/admin/content"));
      }
    } catch (e) {
      setError(
        "Não foi possível conectar ao painel. Verifique se a API está em execução e tente novamente.",
      );
    }
  }
  useEffect(() => {
    boot();
  }, []);
  if (error)
    return (
      <div className="boot-error">
        <Brand />
        <Empty
          icon={Globe}
          title="Vamos reconectar seu espaço"
          description={error}
        >
          <Button icon={RefreshCw} onClick={boot}>
            Tentar novamente
          </Button>
        </Empty>
      </div>
    );
  if (!session) return <Loading />;
  if (!session.authenticated) return <Login session={session} onLogin={boot} />;
  if (!state) return <Loading label="Carregando seus conteúdos…" />;
  return (
    <Workspace
      session={session}
      initialState={state}
      onLogout={() => {
        setSession(null);
        setState(null);
        boot();
      }}
    />
  );
}
function Login({ session, onLogin }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e, local = false) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(local ? "/api/local-session" : "/api/login", {
        method: "POST",
        body: local ? {} : { email, password },
      });
      await onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <div className="login-appearance">
        <ThemeMenu />
      </div>
      <div className="login-visual">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">CONEXÕES QUE TRANSFORMAM</span>
          <h1>
            Grandes ideias.
            <br />
            Novos <em>capítulos.</em>
          </h1>
          <p>
            Um espaço para cuidar da presença do Nexo e aproximar ainda mais
            pessoas da vida pública.
          </p>
        </div>
        <span className="login-credit">
          Faculdade de Direito · Universidade de São Paulo
        </span>
      </div>
      <main className="login-main">
        <form onSubmit={login}>
          <span className="eyebrow">SEU ESPAÇO EDITORIAL</span>
          <h2>Bem-vindo ao Nexo Studio.</h2>
          <p>Entre para gerenciar os conteúdos do site.</p>
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          <fieldset disabled={busy}>
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="Seu e-mail de acesso"
              autoComplete="username"
              required
            />
            <Field
              label="Senha"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Sua senha"
              autoComplete="current-password"
              required
            />
            <Button
              variant="primary"
              type="submit"
              className="w-full"
              icon={busy ? LoaderCircle : ArrowRight}
            >
              {busy ? "Entrando…" : "Entrar no painel"}
            </Button>
          </fieldset>
          {session.localPreview && (
            <div className="local-entry">
              <span>AMBIENTE DE APRESENTAÇÃO</span>
              <Button
                type="button"
                disabled={busy}
                icon={Eye}
                onClick={(e) => login(e, true)}
              >
                Entrar na prévia local
              </Button>
              <p>Explore o painel e teste a edição neste computador.</p>
            </div>
          )}
          <div className="login-foot">
            <ShieldCheck size={15} /> Acesso exclusivo à equipe responsável pelo
            site.
          </div>
        </form>
      </main>
    </div>
  );
}
function Workspace({ session, initialState, onLogout }) {
  const [state, setState] = useState(initialState),
    [content, setContent] = useState(initialState.draft),
    [route, setRoute] = useState(routeFromHash),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [mobileNav, setMobileNav] = useState(false),
    [query, setQuery] = useState(""),
    [mediaQuery, setMediaQuery] = useState(""),
    [mediaFilter, setMediaFilter] = useState("all"),
    [uploading, setUploading] = useState(false),
    [selectedAsset, setSelectedAsset] = useState(null),
    [assetPicker, setAssetPicker] = useState(null),
    [previewMobile, setPreviewMobile] = useState(false),
    [previewKey, setPreviewKey] = useState(0),
    [processTab, setProcessTab] = useState("geral"),
    [sectionTab, setSectionTab] = useState("texto"),
    [blogDirty, setBlogDirty] = useState(false);
  const blogDirtyRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const updateBlogDirty = useCallback((value) => {
    blogDirtyRef.current = value;
    setBlogDirty(value);
  }, []);
  const blogSessionExpired = useCallback(() => setModal("expired"), []);
  const fileRef = useRef(null),
    sidebarRef = useRef(null),
    menuRef = useRef(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setCompact(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact || !mobileNav) return;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector("nav a")?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      if (menuRef.current?.isConnected) menuRef.current.focus();
      else if (previous?.isConnected) previous.focus();
    };
  }, [compact, mobileNav]);
  function drawerKeyDown(event) {
    if (!compact || !mobileNav) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMobileNav(false);
      return;
    }
    if (event.key !== "Tab") return;
    const links = Array.from(
      sidebarRef.current.querySelectorAll("a[href],button:not([disabled])"),
    ).filter((el) => el.getClientRects().length);
    const first = links[0],
      last = links.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  const dirty = JSON.stringify(content) !== JSON.stringify(state.draft);
  const pending = JSON.stringify(content) !== JSON.stringify(state.published);
  const changedSectionCount = changedSections(content, state.published);
  const visibleSectionCount = content.sections.filter((s) => s.visible).length;
  const sectionId = route.startsWith("secao/") ? route.split("/")[1] : null;
  const section = content.sections.find((s) => s.id === sectionId);
  const navId = sectionId
    ? "conteudo"
    : route.startsWith("blog/")
      ? "blog"
      : route;
  const assets = [
    ...INITIAL_ASSETS,
    ...(state.assets || []).filter(
      (a) => !INITIAL_ASSETS.some((b) => b.url === a.url),
    ),
  ];
  const status = effectiveStatus(content.selection);
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  useEffect(() => {
    const listener = () => {
      const nextRoute = routeFromHash();
      if (blogDirtyRef.current && nextRoute !== routeRef.current) {
        window.history.replaceState(null, "", `#${routeRef.current}`);
        setMobileNav(false);
        setModal({ type: "leave-blog", route: nextRoute });
        return;
      }
      setRoute(nextRoute);
      setMobileNav(false);
      setSectionTab("texto");
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e) => {
      if (dirty || blogDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, blogDirty]);
  useEffect(() => {
    const handle = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setQuery("");
        setMobileNav(false);
        setModal("search");
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  function navigate(id) {
    window.location.hash = id;
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function notify(text, error = false) {
    setToast({ text, error });
  }
  function fail(e) {
    notify(
      e.status === 409
        ? "Outra pessoa atualizou este conteúdo. Recarregue os dados para revisar a versão mais recente."
        : e.message,
      true,
    );
    if (e.status === 409) setModal("conflict");
    if (e.status === 401) setModal("expired");
  }
  function accept(data) {
    setState(data);
    setContent(data.draft);
    return data;
  }
  async function saveDraft() {
    if (!dirty) return state;
    return accept(
      await api("/api/admin/content", {
        method: "PUT",
        body: { content, version: state.version },
      }),
    );
  }
  async function save() {
    setBusy(true);
    try {
      await saveDraft();
      notify("Rascunho salvo. Você já pode revisar e publicar.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      const latest = await saveDraft();
      const next = await api("/api/admin/publish", {
        method: "POST",
        body: { version: latest.version },
      });
      accept(next);
      setModal(null);
      notify("Conteúdo publicado com sucesso. O site já usa esta versão.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    try {
      await saveDraft();
      setPreviewKey((k) => k + 1);
      setModal("preview");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function restore(id) {
    setBusy(true);
    try {
      const next = await api("/api/admin/restore", {
        method: "POST",
        body: { id, version: state.version },
      });
      accept(next);
      setModal(null);
      notify("Versão recuperada como rascunho. Revise antes de publicar.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setMobileNav(false);
    if (dirty || blogDirtyRef.current) {
      setModal("logout");
      return;
    }
    await performLogout();
  }
  async function performLogout() {
    setBusy(true);
    try {
      await api("/api/logout", { method: "POST", body: {} });
      setCsrf("");
      onLogout();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function updateSection(id, patch) {
    setContent((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }
  function updateSelection(patch) {
    setContent((c) => ({ ...c, selection: { ...c.selection, ...patch } }));
  }
  function updateSite(patch) {
    setContent((c) => ({ ...c, site: { ...c.site, ...patch } }));
  }
  function editSection(s) {
    navigate(s.id === "selective-process" ? "processo" : `secao/${s.id}`);
  }
  async function upload(files) {
    if (!files?.length || uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("Cada arquivo pode ter até 8 MB.");
        const form = new FormData();
        form.append("file", file);
        const result = await api("/api/admin/uploads", {
          method: "POST",
          form,
        });
        setState((s) => ({
          ...s,
          assets: [...(s.assets || []), result.asset],
        }));
      }
      notify("Arquivos adicionados à biblioteca.");
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function copy(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => notify("Link copiado."))
      .catch(() =>
        notify(
          "Não foi possível copiar automaticamente. Use o endereço exibido.",
          true,
        ),
      );
  }
  const pickerProps = { assets, onBrowse: setAssetPicker };
  const searchEntries = [
    ...new Map(
      [
        ...NAV.map((n) => ({
          id: n.id,
          label: n.label,
          description: "Espaço de trabalho",
        })),
        {
          id: "configuracoes",
          label: "Configurações",
          description: "Identidade, contato e aparência",
        },
        {
          id: "blog",
          label: "Blog do Nexo",
          description: "Artigos, rascunhos e publicações",
        },
        ...content.sections.map((s) => ({
          id: s.id === "selective-process" ? "processo" : `secao/${s.id}`,
          label: s.label,
          description: s.title,
        })),
      ].map((entry) => [entry.id, entry]),
    ).values(),
  ].filter((entry) =>
    (entry.label + " " + entry.description)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(
        query
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase(),
      ),
  );

  const pageTitle =
    section?.label ||
    NAV.find((n) => n.id === navId)?.label ||
    { configuracoes: "Configurações", blog: "Blog do Nexo" }[route] ||
    "Visão geral";
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      {mobileNav && (
        <button
          aria-label="Fechar navegação"
          className="sidebar-overlay"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="sidebar-navigation"
        className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}
        inert={compact && !mobileNav}
        role={compact && mobileNav ? "dialog" : undefined}
        aria-modal={compact && mobileNav ? true : undefined}
        aria-label={compact ? "Navegação do painel" : undefined}
        onKeyDown={drawerKeyDown}
        onClick={(event) => {
          if (event.target.closest("a[href]")) setMobileNav(false);
        }}
      >
        <a
          href="#inicio"
          className="brand-link"
          aria-label="Nexo Studio, visão geral"
        >
          <Brand />
        </a>
        <div className="workspace-identity">
          <span className="workspace-avatar">N</span>
          <div>
            <strong>Nexo Governamental</strong>
            <small>Faculdade de Direito · USP</small>
          </div>
        </div>
        <div className="nav-label">GERENCIAR</div>
        <nav aria-label="Menu principal">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`nav-item ${navId === id ? "active" : ""}`}
              aria-current={navId === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "conteudo" && <small>{content.sections.length}</small>}
            </a>
          ))}
        </nav>
        <div className="nav-label nav-label-second">PREFERÊNCIAS</div>
        <a
          href="#configuracoes"
          className={`nav-item ${route === "configuracoes" ? "active" : ""}`}
        >
          <Settings2 size={18} />
          <span>Configurações</span>
        </a>
        <div className="sidebar-bottom">
          <div className="user-block">
            <div className="avatar">NG</div>
            <div>
              <strong>{session.user?.name || "Equipe Nexo"}</strong>
              <small>
                {session.localPreview
                  ? "Prévia local"
                  : "Administração do site"}
              </small>
            </div>
            <button
              onClick={logout}
              className="icon-button"
              title="Sair do painel"
              aria-label="Sair do painel"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace" inert={compact && mobileNav}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              ref={menuRef}
              aria-expanded={mobileNav}
              aria-controls="sidebar-navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Nexo Studio</span>
            <ChevronRight size={13} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <button
              aria-label="Buscar no painel"
              className="search-trigger"
              onClick={() => {
                setQuery("");
                setModal("search");
              }}
            >
              <Search size={16} />
              <span>Buscar no painel</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-separator" />
            <a className="view-site" href="/" target="_blank" rel="noreferrer">
              Ver site <ArrowUpRight size={15} />
            </a>
            <ThemeMenu />
          </div>
        </header>
        <main id="workspace-main" className="main-content" tabIndex={-1}>
          {!route.startsWith("blog/") && (
            <div className="page-heading">
              <div>
                <h1>{pageTitle}</h1>
                <p>
                  {navId === "inicio"
                    ? "Conteúdo, seleção e publicações em um só lugar."
                    : section
                      ? "Edite os textos e confira o resultado antes de publicar."
                      : navId === "processo"
                        ? "Atualize as inscrições, os documentos e cada etapa da seleção."
                        : navId === "conteudo"
                          ? "Escolha uma seção para editar ou ajustar sua visibilidade."
                          : navId === "midia"
                            ? "Organize as imagens e os documentos usados no site."
                            : navId === "historico"
                              ? "Consulte as alterações e recupere uma versão anterior."
                              : navId === "configuracoes"
                                ? "Informações do site e canais de contato."
                                : "Ideias, projetos e perspectivas para o debate público."}
                </p>
              </div>
              <div className="heading-actions">
                {navId === "inicio" ? (
                  <span className="today">
                    <CalendarDays size={15} />
                    {today}
                  </span>
                ) : navId === "midia" ? (
                  <Button
                    icon={Plus}
                    variant="primary"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    Adicionar arquivos
                  </Button>
                ) : navId === "historico" || navId === "blog" ? null : (
                  <>
                    <Button icon={Eye} disabled={busy} onClick={preview}>
                      Pré-visualizar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <fieldset className="workspace-fields" disabled={busy}>
            {navId === "inicio" && (
              <>
                <section className="dashboard-intro">
                  <img
                    className="dashboard-intro-photo"
                    src="/assets/introduction/usp-840.avif"
                    alt="Fachada da Faculdade de Direito da USP"
                  />
                  <div className="dashboard-intro-content">
                    <span className="eyebrow">
                      NEXO GOVERNAMENTAL · XI DE AGOSTO
                    </span>
                    <h2>
                      Seu site, sempre <em>atualizado.</em>
                    </h2>
                    <p>
                      Um espaço para cuidar de cada detalhe da presença do Nexo.
                    </p>
                    <Button
                      variant="light"
                      onClick={() => navigate("conteudo")}
                    >
                      Editar conteúdo <ArrowRight size={16} />
                    </Button>
                  </div>
                </section>
                <div className="dashboard-layout">
                  <section className="card section-overview">
                    <CardHeading title="Conteúdo do site">
                      <span className="card-count">
                        {
                          content.sections.filter(
                            (item) => item.id !== "selective-process",
                          ).length
                        }{" "}
                        seções
                      </span>
                    </CardHeading>
                    <div className="section-list-head">
                      <span>Seção</span>
                      <span>Visibilidade</span>
                      <span />
                    </div>
                    {content.sections
                      .filter((s) => s.id !== "selective-process")
                      .map((s, i) => (
                        <button
                          className="section-row"
                          key={s.id}
                          onClick={() => editSection(s)}
                          aria-label={`Editar ${s.label}`}
                        >
                          <div className="section-row-info">
                            <span className="section-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <img
                              src={
                                s.id === "introduction"
                                  ? s.extra.image || PHOTOS[s.id]
                                  : PHOTOS[s.id]
                              }
                              alt=""
                            />
                            <div>
                              <strong>{s.label}</strong>
                              <span>{s.title.replace(/\n/g, " ")}</span>
                            </div>
                          </div>
                          <Badge tone={s.visible ? "green" : "neutral"} dot>
                            {s.visible ? "Visível" : "Oculta"}
                          </Badge>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    <button
                      className="section-overview-footer"
                      onClick={() => navigate("conteudo")}
                    >
                      Gerenciar todas as seções <ArrowRight size={15} />
                    </button>
                  </section>
                  <aside className="dashboard-aside">
                    <section className="selection-overview card">
                      <CardHeading title="Processo seletivo">
                        <Badge tone={status.tone} dot>
                          {status.short}
                        </Badge>
                      </CardHeading>
                      <div className="selection-summary">
                        <h3>
                          {content.selection.edition ||
                            "Organize a próxima seleção"}
                        </h3>
                        <p>
                          {content.selection.status === "closed"
                            ? "Atualize o convite e o cronograma para a próxima edição."
                            : "Confira as datas e os links disponíveis para os candidatos."}
                        </p>
                      </div>
                      <div className="selection-dates">
                        <div>
                          <span>Abertura</span>
                          <strong>{dayLabel(content.selection.opensAt)}</strong>
                        </div>
                        <ArrowRight size={16} />
                        <div>
                          <span>Encerramento</span>
                          <strong>
                            {dayLabel(content.selection.closesAt)}
                          </strong>
                        </div>
                      </div>
                      <button
                        className="selection-manage"
                        onClick={() => navigate("processo")}
                      >
                        Editar processo seletivo <ArrowRight size={16} />
                      </button>
                    </section>
                    <section className="card publication-card">
                      <CardHeading title="Publicação" />
                      <div
                        className={`publication-state ${pending ? "has-pending" : ""}`}
                      >
                        <span>
                          {pending ? (
                            <Clock3 size={20} />
                          ) : (
                            <CheckCircle2 size={20} />
                          )}
                        </span>
                        <div>
                          <h3>
                            {pending
                              ? "Alterações em rascunho"
                              : "Tudo atualizado"}
                          </h3>
                          <p>
                            {pending
                              ? "Revise o conteúdo antes de publicar."
                              : "O site está usando a versão publicada."}
                          </p>
                        </div>
                      </div>
                      <Button
                        icon={pending ? Upload : Eye}
                        variant={pending ? "primary" : "secondary"}
                        disabled={busy}
                        onClick={() =>
                          pending ? setModal("publish") : preview()
                        }
                      >
                        {pending
                          ? "Revisar e publicar"
                          : "Pré-visualizar o site"}
                      </Button>
                      <div className="last-published">
                        {state.publishedVersion > 1
                          ? `Publicado em ${dateLabel(state.publishedAt, true)}`
                          : "Conteúdo original do site"}
                        <button
                          className="text-button"
                          onClick={() => navigate("historico")}
                        >
                          Ver histórico <ArrowUpRight size={13} />
                        </button>
                      </div>
                    </section>
                  </aside>
                </div>
              </>
            )}
            {navId === "conteudo" && !sectionId && (
              <>
                <div className="content-toolbar">
                  <span>
                    {content.sections.length} seções da página institucional
                  </span>
                  <span>Alterações ficam no rascunho até a publicação.</span>
                </div>
                <div className="content-table card">
                  <div className="content-table-head">
                    <span>Seção</span>
                    <span>Visibilidade</span>
                    <span />
                  </div>
                  {content.sections.map((s, i) => (
                    <article className="content-row" key={s.id}>
                      <button
                        className="content-row-open"
                        onClick={() => editSection(s)}
                        aria-label={`Abrir ${s.label}`}
                      >
                        <span className="section-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <img
                          src={
                            s.id === "introduction"
                              ? s.extra.image || PHOTOS[s.id]
                              : PHOTOS[s.id]
                          }
                          alt=""
                        />
                        <div>
                          <strong>{s.label}</strong>
                          <span>
                            {s.id === "selective-process"
                              ? content.selection.title
                              : s.title.replace(/\n/g, " ")}
                          </span>
                        </div>
                      </button>
                      <div className="content-row-visibility">
                        <Toggle
                          checked={s.visible}
                          label={`Exibir seção ${s.label}`}
                          onChange={(visible) =>
                            updateSection(s.id, { visible })
                          }
                        />
                        <span>{s.visible ? "Visível" : "Oculta"}</span>
                      </div>
                      <button
                        className="text-button content-row-action"
                        aria-label={`Editar ${s.label}`}
                        onClick={() => editSection(s)}
                      >
                        Editar <ArrowUpRight size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
            {section && (
              <div className="editor-layout">
                <section className="card editor-card">
                  <div className="editor-card-heading">
                    <button
                      className="text-button muted"
                      onClick={() => navigate("conteudo")}
                    >
                      <ArrowLeft size={15} /> Todas as seções
                    </button>
                    <Badge tone={section.visible ? "green" : "neutral"} dot>
                      {section.visible ? "Visível" : "Oculta"}
                    </Badge>
                  </div>
                  <Tabs
                    label="Editor da seção"
                    value={sectionTab}
                    onChange={setSectionTab}
                    panelId="section-editor-panel"
                    tabs={[
                      { id: "texto", label: "Texto" },
                      ...(section.id === "introduction" ||
                      Object.keys(section.extra).length
                        ? [
                            {
                              id: "detalhes",
                              label:
                                section.id === "introduction"
                                  ? "Imagem"
                                  : "Detalhes",
                            },
                          ]
                        : []),
                      ...(["about", "recognize", "more"].includes(section.id)
                        ? [
                            {
                              id: "itens",
                              label:
                                section.id === "recognize"
                                  ? "Galeria"
                                  : section.id === "more"
                                    ? "Projetos"
                                    : "Destaques",
                            },
                          ]
                        : []),
                    ]}
                  />
                  <div
                    className="editor-body"
                    id="section-editor-panel"
                    role="tabpanel"
                    aria-labelledby={`section-editor-panel-tab-${sectionTab}`}
                    tabIndex={0}
                  >
                    {sectionTab === "texto" && (
                      <>
                        <Field
                          label="Nome da seção no painel e na navegação"
                          value={section.label}
                          onChange={(label) =>
                            updateSection(section.id, { label })
                          }
                          maxLength={100}
                        />
                        <Field
                          label="Chamada acima do título"
                          value={section.eyebrow}
                          onChange={(eyebrow) =>
                            updateSection(section.id, { eyebrow })
                          }
                          placeholder="Uma breve introdução à seção"
                          maxLength={200}
                        />
                        <Field
                          label="Título da seção"
                          multiline
                          value={section.title}
                          onChange={(title) =>
                            updateSection(section.id, { title })
                          }
                          maxLength={300}
                          hint="Use uma quebra de linha para separar as partes do título."
                        />
                        <Field
                          label="Descrição"
                          multiline
                          value={section.description}
                          onChange={(description) =>
                            updateSection(section.id, { description })
                          }
                          maxLength={5000}
                        />
                        <div className="setting-row">
                          <div>
                            <strong>Exibir esta seção no site</strong>
                            <p>
                              Você pode preparar o conteúdo com a seção oculta.
                            </p>
                          </div>
                          <Toggle
                            checked={section.visible}
                            label={`Exibir seção ${section.label}`}
                            onChange={(visible) =>
                              updateSection(section.id, { visible })
                            }
                          />
                        </div>
                      </>
                    )}
                    {sectionTab === "detalhes" &&
                    section.id === "introduction" ? (
                      <>
                        <AssetField
                          label="Imagem de apresentação"
                          value={
                            section.extra.image ||
                            "/assets/introduction/usp.webp"
                          }
                          onChange={(image) =>
                            updateSection(section.id, {
                              extra: { ...section.extra, image },
                            })
                          }
                          {...pickerProps}
                        />
                        <Field
                          label="Descrição da imagem de apresentação"
                          value={
                            section.extra.imageAlt ??
                            "Fachada da Faculdade de Direito da USP no Largo de São Francisco"
                          }
                          onChange={(imageAlt) =>
                            updateSection(section.id, {
                              extra: { ...section.extra, imageAlt },
                            })
                          }
                        />
                      </>
                    ) : (
                      sectionTab === "detalhes" &&
                      (Object.keys(section.extra).length ? (
                        Object.entries(section.extra).map(([key, value]) => (
                          <Field
                            key={key}
                            label={FIELD_LABELS?.[key] || LABELS[key] || key}
                            multiline={
                              value.length > 100 ||
                              [
                                "detail",
                                "invitation",
                                "formHelp",
                                "availability",
                              ].includes(key)
                            }
                            value={value}
                            onChange={(v) =>
                              updateSection(section.id, {
                                extra: { ...section.extra, [key]: v },
                              })
                            }
                          />
                        ))
                      ) : (
                        <Empty
                          icon={FileText}
                          title="O essencial já está aqui"
                          description="Esta seção usa apenas o título, a chamada e a descrição principal."
                        />
                      ))
                    )}
                    {sectionTab === "itens" && (
                      <ItemsEditor
                        section={section}
                        onChange={(items) =>
                          updateSection(section.id, { items })
                        }
                        pickerProps={pickerProps}
                      />
                    )}
                  </div>
                </section>
                <aside className="editor-aside">
                  <div className="card section-live-card">
                    <div className="preview-card-label">
                      <Eye size={15} /> PRÉVIA DO CONTEÚDO
                    </div>
                    <img src={PHOTOS[section.id]} alt="" />
                    <div className="mini-section-content">
                      {section.eyebrow && <span>{section.eyebrow}</span>}
                      <h2>{section.title}</h2>
                      <p>{section.description || ""}</p>
                    </div>
                    <button className="preview-card-footer" onClick={preview}>
                      Ver no layout do site <ArrowUpRight size={15} />
                    </button>
                  </div>
                </aside>
              </div>
            )}
            {navId === "processo" && (
              <div className="editor-layout process-layout">
                <section className="card editor-card">
                  <Tabs
                    label="Editor do processo seletivo"
                    value={processTab}
                    onChange={setProcessTab}
                    panelId="process-editor-panel"
                    tabs={[
                      { id: "geral", label: "Informações gerais" },
                      { id: "cronograma", label: "Cronograma" },
                      { id: "links", label: "Links e documentos" },
                    ]}
                  />
                  <div
                    className="editor-body"
                    id="process-editor-panel"
                    role="tabpanel"
                    aria-labelledby={`process-editor-panel-tab-${processTab}`}
                    tabIndex={0}
                  >
                    {processTab === "geral" && (
                      <>
                        <div className="form-section-title">
                          <span className="icon-tile">
                            <CalendarDays size={19} />
                          </span>
                          <div>
                            <h2>Informações da seleção</h2>
                            <p>
                              As informações essenciais para quem quer fazer
                              parte.
                            </p>
                          </div>
                        </div>
                        <label
                          className="standalone-label"
                          id="selection-status-label"
                        >
                          Status do processo seletivo
                        </label>
                        <div
                          className="status-options"
                          role="group"
                          aria-labelledby="selection-status-label"
                        >
                          {[
                            [
                              "upcoming",
                              "Em breve",
                              "Divulgue a próxima edição",
                              Clock3,
                            ],
                            [
                              "open",
                              "Inscrições abertas",
                              "Permita inscrições no período",
                              CheckCircle2,
                            ],
                            [
                              "closed",
                              "Encerrado",
                              "Não receber inscrições",
                              LockKeyhole,
                            ],
                          ].map(([value, label, desc, Icon]) => (
                            <button
                              type="button"
                              key={value}
                              aria-pressed={content.selection.status === value}
                              className={
                                content.selection.status === value
                                  ? "selected"
                                  : ""
                              }
                              onClick={() => updateSelection({ status: value })}
                            >
                              <Icon size={19} />
                              <strong>{label}</strong>
                              <span>{desc}</span>
                              {content.selection.status === value && (
                                <Check size={13} className="option-check" />
                              )}
                            </button>
                          ))}
                        </div>
                        <Field
                          label="Edição do processo"
                          value={content.selection.edition}
                          onChange={(edition) => updateSelection({ edition })}
                          placeholder="Ex.: Processo seletivo 2026.2"
                          maxLength={100}
                        />
                        <Field
                          label="Título do convite"
                          value={content.selection.title}
                          onChange={(title) => updateSelection({ title })}
                          maxLength={300}
                        />
                        <Field
                          label="Descrição e orientações"
                          multiline
                          value={content.selection.description}
                          onChange={(description) =>
                            updateSelection({ description })
                          }
                          placeholder="Conte quem pode participar e o que os candidatos precisam saber."
                        />
                        <div className="form-grid">
                          <Field
                            label="Abertura das inscrições"
                            type="date"
                            value={content.selection.opensAt}
                            onChange={(opensAt) => updateSelection({ opensAt })}
                          />
                          <Field
                            label="Encerramento das inscrições"
                            type="date"
                            value={content.selection.closesAt}
                            min={content.selection.opensAt || undefined}
                            onChange={(closesAt) =>
                              updateSelection({ closesAt })
                            }
                          />
                        </div>
                        <div className="notice">
                          <Clock3 size={17} />
                          <p>
                            As datas usam o horário de Brasília. O botão de
                            inscrição só aparece dentro do prazo, com o status
                            aberto e um link válido.
                          </p>
                        </div>
                        <div className="setting-row">
                          <div>
                            <strong>Exibir o processo seletivo no site</strong>
                            <p>
                              Mantenha o convite visível mesmo entre as edições.
                            </p>
                          </div>
                          <Toggle
                            checked={
                              content.sections.find(
                                (s) => s.id === "selective-process",
                              ).visible
                            }
                            label="Exibir processo seletivo"
                            onChange={(visible) =>
                              updateSection("selective-process", { visible })
                            }
                          />
                        </div>
                      </>
                    )}
                    {processTab === "cronograma" && (
                      <>
                        <div className="form-section-title">
                          <div>
                            <h2>Etapas do processo</h2>
                            <p>
                              Monte um cronograma que a equipe possa atualizar
                              sem editar imagens.
                            </p>
                          </div>
                        </div>
                        <Field
                          label="Título do cronograma"
                          value={content.selection.scheduleTitle}
                          onChange={(scheduleTitle) =>
                            updateSelection({ scheduleTitle })
                          }
                        />
                        {!content.selection.stages.length ? (
                          <Empty
                            icon={CalendarDays}
                            title="Nenhuma etapa cadastrada"
                            description="Adicione inscrição, entrevistas, resultado ou qualquer outra etapa da seleção."
                          />
                        ) : (
                          <div className="stage-list">
                            {content.selection.stages.map((stage, i) => (
                              <div className="stage-editor" key={stage.id}>
                                <span className="stage-index">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <div className="stage-fields">
                                  <div className="form-grid">
                                    <Field
                                      label={`Nome da etapa ${i + 1}`}
                                      value={stage.title}
                                      onChange={(title) =>
                                        updateSelection({
                                          stages: content.selection.stages.map(
                                            (s) =>
                                              s.id === stage.id
                                                ? { ...s, title }
                                                : s,
                                          ),
                                        })
                                      }
                                    />
                                    <Field
                                      label={`Data da etapa ${i + 1}`}
                                      type="date"
                                      value={stage.date}
                                      onChange={(date) =>
                                        updateSelection({
                                          stages: content.selection.stages.map(
                                            (s) =>
                                              s.id === stage.id
                                                ? { ...s, date }
                                                : s,
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <Field
                                    label={`Orientações da etapa ${i + 1}`}
                                    value={stage.description}
                                    multiline
                                    onChange={(description) =>
                                      updateSelection({
                                        stages: content.selection.stages.map(
                                          (s) =>
                                            s.id === stage.id
                                              ? { ...s, description }
                                              : s,
                                        ),
                                      })
                                    }
                                  />
                                  <div className="item-actions">
                                    <button
                                      className="text-button muted"
                                      disabled={i === 0}
                                      onClick={() => {
                                        const stages = [
                                          ...content.selection.stages,
                                        ];
                                        [stages[i - 1], stages[i]] = [
                                          stages[i],
                                          stages[i - 1],
                                        ];
                                        updateSelection({ stages });
                                      }}
                                    >
                                      Mover para cima
                                    </button>
                                    <button
                                      className="text-button danger"
                                      onClick={() =>
                                        updateSelection({
                                          stages:
                                            content.selection.stages.filter(
                                              (s) => s.id !== stage.id,
                                            ),
                                        })
                                      }
                                    >
                                      <Trash2 size={14} /> Remover etapa
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <Button
                          icon={Plus}
                          className="w-full"
                          onClick={() =>
                            updateSelection({
                              stages: [
                                ...content.selection.stages,
                                {
                                  id: crypto.randomUUID(),
                                  title: "",
                                  date: "",
                                  description: "",
                                },
                              ],
                            })
                          }
                        >
                          Adicionar etapa
                        </Button>
                        <div className="form-divider" />
                        <AssetField
                          label="Imagem do cronograma (opcional)"
                          value={content.selection.scheduleImage}
                          onChange={(scheduleImage) =>
                            updateSelection({ scheduleImage })
                          }
                          {...pickerProps}
                        />
                        <p className="field-hint">
                          Quando houver etapas cadastradas, elas substituem a
                          imagem do cronograma no site.
                        </p>
                      </>
                    )}
                    {processTab === "links" && (
                      <>
                        <div className="form-section-title">
                          <span className="icon-tile">
                            <Link2 size={20} />
                          </span>
                          <div>
                            <h2>Edital e inscrições</h2>
                            <p>
                              Direcione os candidatos para os documentos e
                              inscrições.
                            </p>
                          </div>
                        </div>
                        <AssetField
                          label="Link do edital"
                          value={content.selection.noticeUrl}
                          onChange={(noticeUrl) =>
                            updateSelection({ noticeUrl })
                          }
                          accept="all"
                          {...pickerProps}
                        />
                        <p className="field-hint">
                          Use um documento público ou selecione um PDF da
                          biblioteca.
                        </p>
                        <div className="form-divider" />
                        <Field
                          label="Link do formulário de inscrição"
                          value={content.selection.applicationUrl}
                          onChange={(applicationUrl) =>
                            updateSelection({ applicationUrl })
                          }
                          placeholder="https://forms.google.com/…"
                          hint="Obrigatório para publicar o processo com inscrições abertas."
                        />
                        <Field
                          label="Texto do botão de inscrição"
                          value={content.selection.buttonLabel}
                          onChange={(buttonLabel) =>
                            updateSelection({ buttonLabel })
                          }
                          maxLength={100}
                        />
                        <div className="notice">
                          <ShieldCheck size={18} />
                          <p>
                            Confira se o edital e o formulário podem ser abertos
                            por qualquer candidato antes de publicar.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </section>
                <aside className="editor-aside">
                  <div className="card process-preview">
                    <div className="preview-card-label">
                      <Eye size={15} /> PRÉVIA DO CONVITE
                    </div>
                    <div className="process-preview-body">
                      <div className="process-preview-mark">
                        <img
                          src="/assets/introduction/brand-without-background.webp"
                          alt=""
                        />
                      </div>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {content.selection.edition && (
                        <span className="process-edition">
                          {content.selection.edition}
                        </span>
                      )}
                      <h2>
                        {content.selection.title ||
                          "Seu próximo capítulo começa no Nexo."}
                      </h2>
                      <p>{content.selection.description || ""}</p>
                      {(content.selection.opensAt ||
                        content.selection.closesAt) && (
                        <div className="process-preview-dates">
                          <CalendarDays size={15} />
                          {dayLabel(content.selection.opensAt)} —{" "}
                          {dayLabel(content.selection.closesAt)}
                        </div>
                      )}
                      {content.selection.noticeUrl && (
                        <span className="process-fake-button">
                          <FileText size={15} /> Abrir edital{" "}
                          <ArrowUpRight size={14} />
                        </span>
                      )}
                      {status.tone === "green" &&
                        content.selection.applicationUrl && (
                          <span className="process-fake-button application">
                            {content.selection.buttonLabel}
                            <ArrowRight size={14} />
                          </span>
                        )}
                    </div>
                    <button className="preview-card-footer" onClick={preview}>
                      Ver no layout do site <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="selection-checklist card">
                    <h3>Antes de publicar</h3>
                    {[
                      ["Convite preenchido", !!content.selection.title],
                      [
                        "Prazo definido",
                        !!(
                          content.selection.opensAt &&
                          content.selection.closesAt
                        ),
                      ],
                      ["Edital disponível", !!content.selection.noticeUrl],
                      ["Link de inscrição", !!content.selection.applicationUrl],
                    ].map(([label, done]) => (
                      <div key={label}>
                        <span className={done ? "check-done" : "check-empty"}>
                          {done ? <Check size={12} /> : null}
                        </span>
                        {label}
                      </div>
                    ))}
                    <p>
                      Os itens ajudam na revisão. Datas e edital são opcionais.
                    </p>
                  </div>
                </aside>
              </div>
            )}
            {navId === "midia" && (
              <>
                <div
                  className="upload-zone"
                  role="button"
                  tabIndex={0}
                  aria-label="Adicionar arquivos à biblioteca"
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    upload(e.dataTransfer.files);
                  }}
                >
                  <span className="upload-icon">
                    {uploading ? (
                      <LoaderCircle className="spin" size={24} />
                    ) : (
                      <Upload size={24} />
                    )}
                  </span>
                  <h2>
                    {uploading
                      ? "Adicionando seus arquivos…"
                      : "Adicionar arquivos"}
                  </h2>
                  <p>
                    Solte imagens ou documentos aqui, ou{" "}
                    <strong>escolha arquivos</strong>
                  </p>
                  <span>JPG, PNG, WebP, AVIF e PDF · até 8 MB por arquivo</span>
                </div>
                <div className="library-toolbar">
                  <div className="segmented-tabs">
                    {[
                      ["all", "Todos"],
                      ["image", "Imagens"],
                      ["document", "Documentos"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={mediaFilter === id ? "active" : ""}
                        onClick={() => setMediaFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="input-search">
                    <Search size={17} />
                    <input
                      aria-label="Buscar arquivos"
                      placeholder="Buscar na biblioteca…"
                      value={mediaQuery}
                      onChange={(e) => setMediaQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="media-grid">
                  {assets
                    .filter(
                      (a) =>
                        (mediaFilter === "all" ||
                          (mediaFilter === "image" ? !isPdf(a) : isPdf(a))) &&
                        a.name.toLowerCase().includes(mediaQuery.toLowerCase()),
                    )
                    .map((asset) => (
                      <button
                        className="media-card"
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                      >
                        <div>
                          {isPdf(asset) ? (
                            <FileText size={49} />
                          ) : (
                            <img
                              src={asset.url}
                              alt={asset.name}
                              loading="lazy"
                            />
                          )}
                          <span className="media-type">
                            {isPdf(asset) ? "PDF" : "IMAGEM"}
                          </span>
                        </div>
                        <section>
                          <strong>{asset.name}</strong>
                          <span>
                            {bytesLabel(asset.size)}
                            <ArrowUpRight size={15} />
                          </span>
                        </section>
                      </button>
                    ))}
                </div>
                {!assets.some(
                  (a) =>
                    (mediaFilter === "all" ||
                      (mediaFilter === "image" ? !isPdf(a) : isPdf(a))) &&
                    a.name.toLowerCase().includes(mediaQuery.toLowerCase()),
                ) && (
                  <Empty
                    icon={FolderOpen}
                    title="Nenhum arquivo por aqui"
                    description="Tente outra busca ou adicione um novo arquivo à biblioteca."
                  />
                )}
              </>
            )}
            {navId === "historico" && (
              <section className="card history-card">
                <div className="history-intro">
                  <div className="icon-tile">
                    <History size={22} />
                  </div>
                  <div>
                    <h2>Versões do conteúdo</h2>
                    <p>
                      Restaurar uma versão cria um rascunho. O site só muda
                      depois de publicar.
                    </p>
                  </div>
                  <Badge tone="green" dot>
                    Versão {state.version}
                  </Badge>
                </div>
                {state.history?.length ? (
                  <div className="history-list">
                    {state.history.map((entry, i) => (
                      <div key={entry.id} className="history-row">
                        <span
                          className={`history-icon ${entry.action === "published" ? "published" : ""}`}
                        >
                          {entry.action === "published" ? (
                            <CheckCheck size={18} />
                          ) : entry.action === "draft.restored" ? (
                            <History size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3>
                              {ACTIONS[entry.action] || "Conteúdo atualizado"}
                            </h3>
                            {i === 0 && <Badge>Mais recente</Badge>}
                          </div>
                          <p>
                            {entry.summary ||
                              "Atualização do conteúdo institucional"}
                          </p>
                          <span>{dateLabel(entry.createdAt, true)}</span>
                        </div>
                        <Button
                          icon={History}
                          onClick={() => setModal({ type: "restore", entry })}
                        >
                          Restaurar
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={History}
                    title="A história começa aqui"
                    description="Ao salvar ou publicar, suas versões aparecerão neste espaço."
                  />
                )}
              </section>
            )}
            {navId === "configuracoes" && (
              <div className="editor-layout">
                <section className="card editor-card">
                  <div className="editor-body">
                    <div className="form-section-title">
                      <span className="icon-tile">
                        <Globe size={20} />
                      </span>
                      <div>
                        <h2>Identidade institucional</h2>
                        <p>As informações que apresentam o Nexo ao mundo.</p>
                      </div>
                    </div>
                    <Field
                      label="Nome do site"
                      value={content.site.name}
                      onChange={(name) => updateSite({ name })}
                      maxLength={200}
                    />
                    <Field
                      label="Descrição para mecanismos de busca"
                      multiline
                      value={content.site.description}
                      onChange={(description) => updateSite({ description })}
                      maxLength={500}
                      hint="Este resumo identifica o site nos mecanismos de busca."
                    />
                    <Field
                      label="Título do rodapé"
                      value={content.site.footerTitle}
                      onChange={(footerTitle) => updateSite({ footerTitle })}
                    />
                    <div className="form-divider" />
                    <div className="form-section-title">
                      <span className="icon-tile">
                        <Mail size={20} />
                      </span>
                      <div>
                        <h2>Canais de contato</h2>
                        <p>Conecte os visitantes à equipe.</p>
                      </div>
                    </div>
                    <Field
                      label="E-mail de contato"
                      type="email"
                      value={content.site.email}
                      onChange={(email) => updateSite({ email })}
                      hint="Também será o destinatário do formulário de contato."
                    />
                    <Field
                      label="Endereço do Instagram"
                      value={content.site.instagramUrl}
                      onChange={(instagramUrl) => updateSite({ instagramUrl })}
                      placeholder="https://www.instagram.com/…"
                    />
                    <Field
                      label="Nome de usuário do Instagram"
                      value={content.site.instagramHandle}
                      onChange={(instagramHandle) =>
                        updateSite({ instagramHandle })
                      }
                      placeholder="@nexogovernamental"
                    />
                  </div>
                </section>
                <aside className="editor-aside">
                  <div className="card search-preview">
                    <span className="eyebrow">PRÉVIA NOS BUSCADORES</span>
                    <span className="search-preview-domain">
                      <img src="/assets/favicons/favicon-32x32.png" alt="" />{" "}
                      Nexo Governamental
                    </span>
                    <h3>{content.site.name}</h3>
                    <p>{content.site.description}</p>
                  </div>
                  <div className="card access-card">
                    <ShieldCheck size={23} />
                    <h3>Acesso ao painel</h3>
                    <p>
                      {session.localPreview
                        ? "Você está na prévia local do painel."
                        : "Você está conectado como administrador do site."}
                    </p>
                    <span>
                      {session.user?.email || "Equipe Nexo Governamental"}
                    </span>
                  </div>
                </aside>
              </div>
            )}
            {navId === "blog" && (
              <Suspense
                fallback={<Loading label="Abrindo o espaço editorial…" />}
              >
                <BlogWorkspace
                  route={route}
                  session={session}
                  mediaAssets={INITIAL_ASSETS}
                  notify={notify}
                  onSessionExpired={blogSessionExpired}
                  onDirtyChange={updateBlogDirty}
                />
              </Suspense>
            )}
            {!section && sectionId && (
              <Empty
                title="Seção não encontrada"
                description="Volte à lista para escolher uma seção disponível."
              >
                <Button onClick={() => navigate("conteudo")}>
                  Todas as seções
                </Button>
              </Empty>
            )}
          </fieldset>
          <footer className="workspace-footer">
            <span>
              Nexo Studio <i /> Painel editorial
            </span>
            <span>Faculdade de Direito · USP</span>
          </footer>
        </main>
        {navId !== "blog" && (dirty || pending) && (
          <div className="save-bar">
            <div>
              <span className={dirty ? "amber-dot" : "green-dot"} />
              <strong>
                {dirty ? "Alterações não salvas" : "Rascunho salvo"}
              </strong>
              <span className="save-bar-detail">
                {dirty
                  ? "Salve para continuar depois."
                  : "Revise e publique quando estiver pronto."}
              </span>
            </div>
            <div>
              <Button icon={Save} disabled={!dirty || busy} onClick={save}>
                {busy ? "Aguarde…" : "Salvar rascunho"}
              </Button>
              <Button
                variant="primary"
                icon={Upload}
                disabled={busy}
                onClick={() => setModal("publish")}
              >
                Publicar alterações
              </Button>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Selecionar arquivos para upload"
        onChange={(e) => upload(e.target.files)}
      />
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.text}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "publish" && (
        <Modal
          title="Publicar alterações?"
          description="Revise o que vai mudar no site antes de publicar."
          onClose={() => !busy && setModal(null)}
        >
          <div className="publish-summary">
            {JSON.stringify(content.site) !==
              JSON.stringify(state.published.site) && (
              <span>
                <Globe size={18} /> Identidade e canais de contato atualizados
              </span>
            )}
            <span>
              <PanelsTopLeft size={18} /> {changedSectionCount}{" "}
              {changedSectionCount === 1 ? "seção" : "seções"} com alterações
            </span>
            <span>
              <CalendarDays size={18} /> Processo seletivo:{" "}
              {status.label.toLowerCase()}
            </span>
            <span>
              <Eye size={18} /> {visibleSectionCount}{" "}
              {visibleSectionCount === 1 ? "seção visível" : "seções visíveis"}
            </span>
          </div>
          <p className="modal-text">
            A versão atual fica no histórico e pode ser recuperada.{" "}
            {dirty
              ? "Suas alterações serão salvas e publicadas juntas."
              : "O rascunho salvo será exibido aos visitantes."}
          </p>
          {session.localPreview && (
            <div className="notice">
              <Info size={17} />
              <p>
                Esta publicação atualiza o site da prévia local neste
                computador.
              </p>
            </div>
          )}
          <div className="modal-actions">
            <Button disabled={busy} onClick={() => setModal(null)}>
              Continuar editando
            </Button>
            <Button
              icon={Upload}
              variant="primary"
              disabled={busy}
              onClick={publish}
            >
              {busy ? "Publicando…" : "Confirmar publicação"}
            </Button>
          </div>
        </Modal>
      )}
      {modal === "preview" && (
        <Modal
          title="Prévia do site"
          description="Prévia do rascunho salvo. Navegue pela página para revisar os detalhes."
          onClose={() => setModal(null)}
          wide
        >
          <div className="preview-toolbar">
            <span>
              <i className="amber-dot" /> Rascunho · acesso restrito
            </span>
            <div>
              <button
                aria-label="Prévia desktop"
                aria-pressed={!previewMobile}
                className={!previewMobile ? "active" : ""}
                onClick={() => setPreviewMobile(false)}
              >
                <Monitor size={18} />
              </button>
              <button
                aria-label="Prévia celular"
                aria-pressed={previewMobile}
                className={previewMobile ? "active" : ""}
                onClick={() => setPreviewMobile(true)}
              >
                <Smartphone size={18} />
              </button>
            </div>
            <a href="/?preview=1" target="_blank" rel="noreferrer">
              Abrir <ArrowUpRight size={15} />
            </a>
          </div>
          <div
            className={`preview-frame-wrap ${previewMobile ? "preview-mobile" : ""}`}
          >
            <iframe
              key={previewKey}
              title="Prévia do site Nexo Governamental"
              src="/?preview=1"
            />
          </div>
        </Modal>
      )}
      {modal === "search" && (
        <Modal
          title="Buscar no painel"
          description="Encontre uma seção ou um espaço do painel."
          onClose={() => setModal(null)}
        >
          <div className="input-search global-search">
            <Search size={19} />
            <input
              autoFocus
              placeholder="Busque por título ou seção…"
              aria-label="Buscar no painel"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="search-results">
            {!searchEntries.length && (
              <Empty
                icon={Search}
                title="Nenhum resultado"
                description="Tente buscar por uma seção, como Processo seletivo ou Contato."
              />
            )}
            {searchEntries.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  navigate(r.id);
                  setModal(null);
                }}
              >
                <span>
                  <strong>{r.label}</strong>
                  <small>{r.description}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "restore" && (
        <Modal
          title="Recuperar esta versão?"
          description={dateLabel(modal.entry.createdAt, true)}
          onClose={() => !busy && setModal(null)}
        >
          <p className="modal-text">
            O conteúdo desta versão será recuperado como rascunho.{" "}
            {dirty ? "As alterações ainda não salvas serão descartadas. " : ""}
            Você poderá revisar tudo antes de publicar.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={History}
              disabled={busy}
              onClick={() => restore(modal.entry.id)}
            >
              {busy ? "Restaurando…" : "Restaurar como rascunho"}
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "leave-blog" && (
        <Modal
          title="Sair sem salvar o artigo?"
          description="Há alterações que ainda não foram salvas."
          onClose={() => setModal(null)}
        >
          <p className="modal-text">
            Volte à edição para salvar o rascunho ou descarte apenas as
            alterações desta sessão.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Continuar editando</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = modal.route;
                updateBlogDirty(false);
                setModal(null);
                navigate(target);
              }}
            >
              Sair sem salvar
            </Button>
          </div>
        </Modal>
      )}
      {["conflict", "expired", "logout"].includes(modal) && (
        <Modal
          title={
            modal === "conflict"
              ? "Há uma versão mais recente."
              : modal === "expired"
                ? "Sua sessão expirou."
                : "Sair com alterações pendentes?"
          }
          onClose={() => setModal(null)}
        >
          <p className="modal-text">
            {modal === "conflict"
              ? "Suas alterações continuam nesta tela. Copie o que deseja preservar antes de recarregar, pois o rascunho será substituído pela versão mais recente."
              : modal === "expired"
                ? "Copie os textos que ainda não foram salvos. Entre novamente para continuar a edição."
                : "O que ainda não foi salvo será perdido. Você pode voltar, salvar o rascunho e sair em seguida."}
          </p>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Voltar à edição</Button>
            <Button
              variant="primary"
              onClick={
                modal === "logout"
                  ? performLogout
                  : () => window.location.reload()
              }
            >
              {modal === "logout" ? "Sair sem salvar" : "Recarregar painel"}
            </Button>
          </div>
        </Modal>
      )}
      {selectedAsset && (
        <Modal
          title={selectedAsset.name}
          description={bytesLabel(selectedAsset.size)}
          onClose={() => setSelectedAsset(null)}
        >
          {isPdf(selectedAsset) ? (
            <div className="asset-document-preview">
              <FileText size={60} />
              <span>Documento PDF</span>
            </div>
          ) : (
            <img
              className="asset-modal-image"
              src={selectedAsset.url}
              alt={selectedAsset.name}
            />
          )}
          <Field
            label="Endereço do arquivo"
            value={selectedAsset.url}
            onChange={() => {}}
            readOnly
          />
          <div className="modal-actions">
            <Button icon={Copy} onClick={() => copy(selectedAsset.url)}>
              Copiar endereço
            </Button>
            <a
              className="button button-primary"
              href={selectedAsset.url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir arquivo <ArrowUpRight size={16} />
            </a>
          </div>
        </Modal>
      )}
      {assetPicker && (
        <Modal
          title="Escolher arquivo"
          description="Selecione um arquivo da biblioteca para usar neste conteúdo."
          onClose={() => setAssetPicker(null)}
        >
          <div className="asset-picker-grid">
            {assets
              .filter((a) => assetPicker.accept === "all" || !isPdf(a))
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    assetPicker.onSelect(a.url);
                    setAssetPicker(null);
                  }}
                >
                  {isPdf(a) ? (
                    <FileText size={35} />
                  ) : (
                    <img src={a.url} alt="" />
                  )}
                  <span>{a.name}</span>
                </button>
              ))}
          </div>
          <div className="modal-actions">
            <Button
              icon={Upload}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Enviando…" : "Adicionar novo arquivo"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function isPdf(a) {
  return String(a.type || a.url).includes("pdf");
}
function changedSections(content, published) {
  let n = content.sections.filter(
    (s) =>
      JSON.stringify(s) !==
      JSON.stringify(published?.sections.find((p) => p.id === s.id)),
  ).length;
  if (
    JSON.stringify(content.selection) !==
      JSON.stringify(published?.selection) &&
    !content.sections.some(
      (s) =>
        s.id === "selective-process" &&
        JSON.stringify(s) !==
          JSON.stringify(published?.sections.find((p) => p.id === s.id)),
    )
  )
    n++;
  return n;
}
function ItemsEditor({ section, onChange, pickerProps }) {
  function patchItem(id, patch) {
    onChange(
      section.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }
  return (
    <>
      <div className="item-intro">
        <h2>
          {section.id === "recognize"
            ? "Imagens da galeria"
            : section.id === "more"
              ? "Projetos do Nexo"
              : "Destaques da seção"}
        </h2>
        <p>Edite cada item e organize a ordem em que ele aparece.</p>
      </div>
      {section.items.map((item, i) => (
        <details
          className="item-editor"
          key={item.id}
          open={section.items.length === 1 ? true : undefined}
        >
          <summary>
            <span className="item-index">{String(i + 1).padStart(2, "0")}</span>
            <strong>{item.title || "Novo item"}</strong>
            <ChevronDown size={17} />
          </summary>
          <div className="item-editor-body">
            <Field
              label="Título do item"
              value={item.title}
              onChange={(title) => patchItem(item.id, { title })}
            />
            <Field
              label="Descrição do item"
              multiline
              value={item.description}
              onChange={(description) => patchItem(item.id, { description })}
            />
            <Field
              label="Texto complementar do item"
              multiline
              value={item.detail}
              onChange={(detail) => patchItem(item.id, { detail })}
            />
            <AssetField
              label="Imagem do item"
              value={item.image}
              onChange={(image) => patchItem(item.id, { image })}
              {...pickerProps}
            />
            <Field
              label="Descrição da imagem (acessibilidade)"
              value={item.alt}
              onChange={(alt) => patchItem(item.id, { alt })}
            />
            <Field
              label="Link do item (opcional)"
              value={item.url}
              onChange={(url) => patchItem(item.id, { url })}
              placeholder="https://…"
            />
            <div className="item-actions">
              <Button
                disabled={i === 0}
                onClick={() => {
                  const items = [...section.items];
                  [items[i - 1], items[i]] = [items[i], items[i - 1]];
                  onChange(items);
                }}
              >
                Mover para cima
              </Button>
              <button
                className="text-button danger"
                onClick={() =>
                  onChange(section.items.filter((s) => s.id !== item.id))
                }
              >
                <Trash2 size={15} /> Remover item
              </button>
            </div>
          </div>
        </details>
      ))}
      <Button
        className="w-full"
        icon={Plus}
        onClick={() =>
          onChange([
            ...section.items,
            {
              id: crypto.randomUUID(),
              title: "",
              description: "",
              detail: "",
              image: "",
              alt: "",
              url: "",
            },
          ])
        }
      >
        Adicionar item
      </Button>
    </>
  );
}
export default App;
