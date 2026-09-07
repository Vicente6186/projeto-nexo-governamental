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
  CalendarDays,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Search,
  Globe,
  Save,
  Upload,
  Eye,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle2,
  Mail,
  LoaderCircle,
  Monitor,
  Smartphone,
} from "lucide-react";
import {
  Button,
  Field,
  Modal,
  Empty,
  Loading,
  effectiveStatus,
} from "./components";
import { api, setCsrf } from "./api";
import ThemeMenu from "./ThemeMenu";
import { Overview, SelectionEditor, ContactEditor } from "./EssentialPages";

const BlogWorkspace = lazy(() => import("./BlogWorkspace"));

const NAV = [
  {
    id: "inicio",
    label: "Visão geral",
    icon: LayoutDashboard,
    description: "Acompanhe as informações e publicações do Nexo.",
  },
  {
    id: "processo",
    label: "Processo seletivo",
    icon: CalendarDays,
    description: "Inscrições, datas, edital e cronograma.",
  },
  {
    id: "blog",
    label: "Blog do Nexo",
    icon: BookOpen,
    description: "Artigos, rascunhos e publicações.",
  },
  {
    id: "contato",
    label: "Contato",
    icon: Mail,
    description: "E-mail e perfil do Instagram.",
  },
];
const INITIAL_ASSETS = [
  {
    id: "usp",
    name: "Faculdade de Direito · USP",
    url: "/assets/introduction/usp-560.avif",
    type: "image/avif",
    size: 0,
  },
  {
    id: "brand",
    name: "Identidade Nexo Governamental",
    url: "/assets/brand-with-background.webp",
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
    url: "/assets/politicians/presidente.avif",
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
function routeFromHash() {
  try {
    const route = decodeURIComponent(window.location.hash.slice(1));
    if (route === "secao/selective-process") return "processo";
    if (route === "configuracoes") return "contato";
    return /^(inicio|processo|contato|blog(?:\/[a-f0-9-]+)?)$/.test(route)
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
    [uploading, setUploading] = useState(false),
    [previewMobile, setPreviewMobile] = useState(false),
    [previewKey, setPreviewKey] = useState(0),
    [blogDirty, setBlogDirty] = useState(false);
  const blogDirtyRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const updateBlogDirty = useCallback((value) => {
    blogDirtyRef.current = value;
    setBlogDirty(value);
  }, []);
  const blogSessionExpired = useCallback(() => setModal("expired"), []);
  const sidebarRef = useRef(null),
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
  const navId = route.startsWith("blog/") ? "blog" : route;
  const status = effectiveStatus(content.selection);
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  useEffect(() => {
    const canonicalize = (nextRoute) => {
      if (window.location.hash !== `#${nextRoute}`) {
        window.history.replaceState(null, "", `#${nextRoute}`);
      }
    };
    canonicalize(routeRef.current);
    const listener = () => {
      const nextRoute = routeFromHash();
      if (blogDirtyRef.current && nextRoute !== routeRef.current) {
        window.history.replaceState(null, "", `#${routeRef.current}`);
        setMobileNav(false);
        setModal({ type: "leave-blog", route: nextRoute });
        return;
      }
      canonicalize(nextRoute);
      setRoute(nextRoute);
      setMobileNav(false);
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
  function updateSelection(patch) {
    setContent((c) => ({ ...c, selection: { ...c.selection, ...patch } }));
  }
  function updateSite(patch) {
    setContent((c) => ({ ...c, site: { ...c.site, ...patch } }));
  }
  async function uploadNotice(file) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("O edital pode ter até 8 MB.");
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
        throw new Error("Escolha um arquivo PDF para o edital.");
      }
      const form = new FormData();
      form.append("file", file);
      const { asset } = await api("/api/admin/uploads", {
        method: "POST",
        form,
      });
      updateSelection({ noticeUrl: asset.url });
      notify(
        "Edital adicionado ao rascunho. Publique as alterações para atualizar o site.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
    }
  }
  const searchEntries = NAV.filter((entry) =>
    `${entry.label} ${entry.description}`
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
    NAV.find((item) => item.id === navId)?.label || "Visão geral";
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
            </a>
          ))}
        </nav>
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
                <p>{NAV.find((item) => item.id === navId)?.description}</p>
              </div>
              <div className="heading-actions">
                {navId === "inicio" ? (
                  <span className="today">
                    <CalendarDays size={15} />
                    {today}
                  </span>
                ) : navId === "blog" ? null : (
                  <>
                    <Button
                      icon={Eye}
                      disabled={busy || uploading}
                      onClick={preview}
                    >
                      Pré-visualizar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <fieldset className="workspace-fields" disabled={busy}>
            {navId === "inicio" && (
              <Overview
                content={content}
                state={state}
                dirty={dirty}
                pending={pending}
                navigate={navigate}
                onPreview={preview}
                onPublish={() => setModal("publish")}
                busy={busy || uploading}
              />
            )}
            {navId === "processo" && (
              <SelectionEditor
                selection={content.selection}
                onChange={updateSelection}
                disabled={busy}
                onUploadNotice={uploadNotice}
                uploading={uploading}
              />
            )}
            {navId === "contato" && (
              <ContactEditor
                site={content.site}
                onChange={updateSite}
                disabled={busy}
              />
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
            <div role="status">
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
              <Button
                icon={Save}
                disabled={!dirty || busy || uploading}
                onClick={save}
              >
                {busy ? "Aguarde…" : "Salvar rascunho"}
              </Button>
              <Button
                variant="primary"
                icon={Upload}
                disabled={busy || uploading}
                onClick={() => setModal("publish")}
              >
                Publicar alterações
              </Button>
            </div>
          </div>
        )}
      </div>
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
          description="Confira as informações que serão atualizadas no site."
          onClose={() => !busy && setModal(null)}
        >
          <div className="publish-summary">
            {JSON.stringify(content.selection) !==
              JSON.stringify(state.published.selection) && (
              <span>
                <CalendarDays size={18} /> Processo seletivo ·{" "}
                {status.label.toLowerCase()}
              </span>
            )}
            {JSON.stringify(content.site) !==
              JSON.stringify(state.published.site) && (
              <span>
                <Mail size={18} /> Canais de contato atualizados
              </span>
            )}
          </div>
          <p className="modal-text">
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
          description="Acesse rapidamente as quatro áreas do painel."
          onClose={() => setModal(null)}
        >
          <div className="input-search global-search">
            <Search size={19} />
            <input
              autoFocus
              placeholder="Busque por processo, blog ou contato…"
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
                description="Tente buscar por Processo seletivo, Blog ou Contato."
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
    </div>
  );
}
export default App;
