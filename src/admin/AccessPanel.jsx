import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "./api";
import { Badge, Button, Field, Modal } from "./components";
import "./access.css";
import { FormSteps } from "./FormSteps";

const roleLabel = (role) => (role === "admin" ? "Administrador" : "Editor");
const blankMember = () => ({
  name: "",
  email: "",
  password: "",
  role: "editor",
});
const blankPassword = () => ({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

function PasswordField({
  label,
  field,
  value,
  onChange,
  error,
  autoComplete,
  hint,
  disabled,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="access-password-field">
      <Field
        id={`access-${field}`}
        label={label}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        className="access-password-toggle"
        type="button"
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("pt-BR")}`}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function AccessPanel({
  session,
  onClose,
  onSession,
  notify,
  onExpired,
  initialView = "account",
}) {
  const [view, setView] = useState(
    initialView === "team" && session.user?.role === "admin"
      ? "team"
      : "account",
  );
  const [memberStep, setMemberStep] = useState(0);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [teamQuery, setTeamQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [member, setMember] = useState(blankMember);
  const [password, setPassword] = useState(blankPassword);
  const [selected, setSelected] = useState(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const teamRequestRef = useRef(null);
  const contentRef = useRef(null);
  const passwordSummaryRef = useRef(null);
  const focusErrorsRef = useRef(false);
  const viewRef = useRef(view);
  const user = session.user || {};
  const isPreview = user.id === "local-preview";
  const isAdmin = user.role === "admin";
  const personComplete =
    Boolean(member.name.trim()) &&
    member.name.length <= 120 &&
    member.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()) &&
    !errors.name &&
    !errors.email;
  const permissionComplete =
    ["editor", "admin"].includes(member.role) &&
    member.password.length >= 12 &&
    member.password.length <= 1024 &&
    !errors.role &&
    !errors.password;
  const memberSteps = [
    {
      id: "person",
      label: "Pessoa",
      complete: personComplete,
      pending: Boolean(errors.name || errors.email),
    },
    {
      id: "permissions",
      label: "Permissões e senha",
      complete: permissionComplete,
      pending: Boolean(errors.role || errors.password),
    },
  ];
  const normalizeQuery = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visibleUsers = users.filter(
    (item) =>
      normalizeQuery(`${item.name || ""} ${item.email || ""}`).includes(
        normalizeQuery(teamQuery.trim()),
      ) &&
      (teamFilter === "all" ||
        (teamFilter === "active"
          ? item.active
          : teamFilter === "inactive"
            ? !item.active
            : item.role === teamFilter)),
  );
  const activeAdmins = users.filter(
    (item) => item.active && item.role === "admin",
  ).length;

  useEffect(() => {
    if (initialView === "team" && isAdmin) loadTeam();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teamRequestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (viewRef.current === view) return;
    viewRef.current = view;
    const focus = Array.from(
      contentRef.current?.querySelectorAll(
        "input, select, button, summary, [data-view-focus]",
      ) || [],
    ).find((element) => !element.disabled && element.getClientRects().length);
    focus?.focus();
  }, [view]);
  useEffect(() => {
    if (focusErrorsRef.current)
      contentRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    focusErrorsRef.current = false;
  }, [errors]);

  function showErrors(next) {
    if (view === "add") setMemberStep(next.name || next.email ? 0 : 1);
    if (view === "account") setPasswordOpen(true);
    focusErrorsRef.current = true;
    setErrors(next);
  }

  function go(next) {
    if (busyRef.current) return false;
    teamRequestRef.current?.abort();
    teamRequestRef.current = null;
    setLoading(false);
    setError("");
    setErrors({});
    setView(next);
    setMemberStep(0);
    setPasswordOpen(false);
    if (next !== "account") setPassword(blankPassword());
    if (next !== "add") setMember(blankMember());
    return true;
  }
  function handleError(cause) {
    if (!mountedRef.current) return;
    if (cause.status === 401) {
      onExpired?.();
      return;
    }
    const field =
      cause.field || (cause.code === "EMAIL_IN_USE" ? "email" : null);
    if (field) showErrors({ [field]: cause.message });
    else
      setError(cause.message || "Não foi possível concluir. Tente novamente.");
  }
  function start() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setErrors({});
    return true;
  }
  function finish() {
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
  }
  async function loadTeam() {
    if (!isAdmin || busyRef.current) return;
    teamRequestRef.current?.abort();
    const controller = new AbortController();
    teamRequestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/admin/users", {
        signal: controller.signal,
      });
      if (
        mountedRef.current &&
        teamRequestRef.current === controller &&
        !controller.signal.aborted
      )
        setUsers(result.users);
    } catch (cause) {
      if (teamRequestRef.current === controller && !controller.signal.aborted)
        handleError(cause);
    } finally {
      if (teamRequestRef.current === controller) {
        teamRequestRef.current = null;
        if (mountedRef.current) setLoading(false);
      }
    }
  }
  function openTeam() {
    if (go("team")) loadTeam();
  }
  function changeMember(field, value) {
    setMember((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  function goMemberStep(next) {
    setMemberStep(next);
    requestAnimationFrame(() => {
      document
        .getElementById(next === 0 ? "access-name" : "access-password")
        ?.focus();
    });
  }
  function changePassword(field, value) {
    setPassword((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setPasswordChanged(false);
  }
  async function submitPassword(event) {
    event.preventDefault();
    const invalid = {};
    if (!password.currentPassword)
      invalid.currentPassword = "Informe sua senha atual.";
    if (password.newPassword.length < 12 || password.newPassword.length > 1024)
      invalid.newPassword = "Use uma senha com 12 a 1.024 caracteres.";
    if (password.confirmPassword !== password.newPassword)
      invalid.confirmPassword = "As senhas precisam ser iguais.";
    if (Object.keys(invalid).length) {
      showErrors(invalid);
      return;
    }
    if (!start()) return;
    try {
      const result = await api("/api/admin/password", {
        method: "POST",
        body: {
          currentPassword: password.currentPassword,
          newPassword: password.newPassword,
        },
      });
      if (!mountedRef.current) return;
      onSession?.(result);
      if (mountedRef.current) {
        setPassword(blankPassword());
        setPasswordChanged(true);
        setPasswordOpen(false);
        requestAnimationFrame(() => passwordSummaryRef.current?.focus());
      }
      notify?.(
        "Sua senha foi alterada. Os outros acessos desta conta foram encerrados.",
      );
    } catch (cause) {
      handleError(cause);
    } finally {
      finish();
    }
  }
  async function submitMember(event) {
    event.preventDefault();
    const invalid = {};
    if (!member.name.trim()) invalid.name = "Informe o nome do integrante.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()))
      invalid.email = "Informe um e-mail válido.";
    if (memberStep === 0) {
      if (Object.keys(invalid).length) {
        showErrors(invalid);
        return;
      }
      goMemberStep(1);
      return;
    }
    if (member.password.length < 12 || member.password.length > 1024)
      invalid.password = "Use uma senha com 12 a 1.024 caracteres.";
    if (Object.keys(invalid).length) {
      showErrors(invalid);
      return;
    }
    if (!start()) return;
    try {
      const { user: created } = await api("/api/admin/users", {
        method: "POST",
        body: {
          ...member,
          name: member.name.trim(),
          email: member.email.trim().toLowerCase(),
        },
      });
      if (mountedRef.current) {
        setUsers((current) =>
          [...current, created].sort(
            (a, b) =>
              Number(b.active) - Number(a.active) ||
              a.name.localeCompare(b.name, "pt-BR"),
          ),
        );
        setMember(blankMember());
        setTeamQuery("");
        setTeamFilter("all");
        setView("team");
      }
      notify?.(
        `Acesso de ${created.name} criado. Compartilhe a senha inicial diretamente com essa pessoa.`,
      );
    } catch (cause) {
      handleError(cause);
    } finally {
      finish();
    }
  }
  async function confirmAccess() {
    if (!selected || !start()) return;
    try {
      const { user: updated } = await api(`/api/admin/users/${selected.id}`, {
        method: "PATCH",
        body: { active: !selected.active },
      });
      if (mountedRef.current) {
        setUsers((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort(
              (a, b) =>
                Number(b.active) - Number(a.active) ||
                a.name.localeCompare(b.name, "pt-BR"),
            ),
        );
        setSelected(null);
        setView("team");
      }
      notify?.(
        `Acesso de ${updated.name} ${updated.active ? "reativado" : "desativado"}.`,
      );
    } catch (cause) {
      handleError(cause);
    } finally {
      finish();
    }
  }
  const title =
    view === "team"
      ? "Equipe do Nexo"
      : view === "add"
        ? "Adicionar integrante"
        : view === "confirm"
          ? `${selected?.active ? "Desativar" : "Reativar"} acesso`
          : "Meu acesso";
  const description =
    view === "team"
      ? "Cada integrante entra com sua própria conta."
      : view === "add"
        ? undefined
        : undefined;

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      className={view === "team" ? "access-team-modal" : ""}
    >
      <div
        className="access-panel"
        ref={contentRef}
        aria-busy={busy || loading}
      >
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {view === "account" && (
          <>
            <div className="access-profile">
              <span className="access-avatar">
                <UserRound size={22} />
              </span>
              <div>
                <strong>{user.name || "Equipe Nexo"}</strong>
                <span>{isPreview ? "Prévia local" : user.email}</span>
              </div>
              <Badge tone={isAdmin ? "green" : "neutral"}>
                {roleLabel(user.role)}
              </Badge>
            </div>
            {isAdmin && (
              <button
                type="button"
                className="access-team-link"
                onClick={openTeam}
                disabled={busy}
              >
                <Users size={20} />
                <span>
                  <strong>Gerenciar equipe</strong>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            )}
            {isPreview ? (
              <p className="access-note">A prévia local não possui senha.</p>
            ) : (
              <>
                {passwordChanged && (
                  <p className="access-success" role="status">
                    <Check size={18} /> Senha alterada com sucesso.
                  </p>
                )}
                <details
                  className="access-password-section"
                  open={passwordOpen}
                  onToggle={(event) =>
                    setPasswordOpen(event.currentTarget.open)
                  }
                >
                  <summary ref={passwordSummaryRef}>
                    <KeyRound size={18} /> Alterar minha senha
                  </summary>
                  <form
                    className="access-form"
                    onSubmit={submitPassword}
                    noValidate
                  >
                    <PasswordField
                      label="Senha atual"
                      field="currentPassword"
                      value={password.currentPassword}
                      onChange={(value) =>
                        changePassword("currentPassword", value)
                      }
                      error={errors.currentPassword}
                      autoComplete="current-password"
                      disabled={busy}
                    />
                    <PasswordField
                      label="Nova senha"
                      field="newPassword"
                      value={password.newPassword}
                      onChange={(value) => changePassword("newPassword", value)}
                      error={errors.newPassword}
                      autoComplete="new-password"
                      hint="Pelo menos 12 caracteres."
                      disabled={busy}
                    />
                    <PasswordField
                      label="Confirmar nova senha"
                      field="confirmPassword"
                      value={password.confirmPassword}
                      onChange={(value) =>
                        changePassword("confirmPassword", value)
                      }
                      error={errors.confirmPassword}
                      autoComplete="new-password"
                      disabled={busy}
                    />
                    <p className="access-note">
                      Os outros dispositivos precisarão entrar novamente.
                    </p>
                    <div className="access-actions">
                      <Button
                        type="submit"
                        variant="primary"
                        icon={busy ? LoaderCircle : KeyRound}
                        disabled={busy}
                      >
                        {busy ? "Alterando…" : "Alterar senha"}
                      </Button>
                    </div>
                  </form>
                </details>
              </>
            )}
          </>
        )}
        {view === "team" && (
          <>
            <div className="access-toolbar">
              <Button
                icon={ArrowLeft}
                onClick={() => go("account")}
                data-view-focus
              >
                Meu acesso
              </Button>
              <Button
                variant="primary"
                icon={Plus}
                disabled={loading}
                onClick={() => go("add")}
              >
                Adicionar integrante
              </Button>
            </div>
            <div className="team-filters">
              <Field
                label="Buscar integrante"
                value={teamQuery}
                onChange={setTeamQuery}
                placeholder="Nome ou e-mail"
              />
              <label className="team-filter-label">
                Mostrar
                <select
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                >
                  <option value="all">Toda a equipe</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Desativados</option>
                  <option value="admin">Administradores</option>
                  <option value="editor">Editores</option>
                </select>
              </label>
            </div>
            {!loading && users.length > 0 && (
              <p className="team-result-count" role="status">
                {visibleUsers.length} de {users.length} integrantes
              </p>
            )}
            {!loading && users.length > 0 && !visibleUsers.length && (
              <div className="access-empty">
                <h3>Nenhum integrante encontrado</h3>
                <p>Tente outro nome ou ajuste o filtro.</p>
                <Button
                  onClick={() => {
                    setTeamQuery("");
                    setTeamFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
            {loading ? (
              <div className="access-loading" role="status">
                <LoaderCircle size={22} />
                Carregando equipe…
              </div>
            ) : (
              <>
                {!users.length && !error ? (
                  <div className="access-empty">
                    <Users size={28} />
                    <h3>Comece pela sua equipe</h3>
                    <p>
                      Adicione os integrantes que vão atualizar o processo
                      seletivo, os contatos e o blog.
                    </p>
                  </div>
                ) : (
                  <ul
                    className="access-users"
                    aria-label="Integrantes da equipe"
                  >
                    {visibleUsers.map((item) => {
                      const self = item.id === user.id;
                      const lastAdmin =
                        item.active &&
                        item.role === "admin" &&
                        activeAdmins <= 1;
                      return (
                        <li
                          className={`access-user${item.active ? "" : " is-inactive"}`}
                          key={item.id}
                        >
                          <div className="access-user-details">
                            <strong>
                              {item.name}
                              {self && <span className="access-you">Você</span>}
                            </strong>
                            <span>{item.email}</span>
                            <div className="access-user-badges">
                              <Badge>{roleLabel(item.role)}</Badge>
                              <Badge tone={item.active ? "green" : "neutral"}>
                                {item.active ? "Ativo" : "Desativado"}
                              </Badge>
                            </div>
                          </div>
                          <div className="access-user-action">
                            <Button
                              disabled={self || lastAdmin}
                              onClick={() => {
                                setSelected(item);
                                go("confirm");
                              }}
                              aria-label={`${item.active ? "Desativar" : "Reativar"} ${item.name}`}
                            >
                              {item.active ? "Desativar" : "Reativar"}
                            </Button>
                            {self || lastAdmin ? (
                              <small>
                                {self ? "Seu acesso" : "Único administrador"}
                              </small>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {error && <Button onClick={loadTeam}>Tentar novamente</Button>}
              </>
            )}
          </>
        )}
        {view === "add" && (
          <form className="access-form" onSubmit={submitMember} noValidate>
            <FormSteps
              label="Etapas do novo acesso"
              steps={memberSteps}
              value={memberStep}
              onChange={goMemberStep}
              disabled={busy}
            />
            <fieldset
              className="form-step-panel"
              hidden={memberStep !== 0}
              disabled={busy}
            >
              <Field
                id="access-name"
                label="Nome"
                value={member.name}
                onChange={(value) => changeMember("name", value)}
                error={errors.name}
                maxLength={120}
                autoComplete="off"
                disabled={busy}
              />
              <Field
                id="access-email"
                label="E-mail"
                type="email"
                value={member.email}
                onChange={(value) => changeMember("email", value)}
                error={errors.email}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
              />
            </fieldset>
            <fieldset
              className="form-step-panel"
              hidden={memberStep !== 1}
              disabled={busy}
            >
              <p className="access-member-summary">
                <strong>{member.name || "Novo integrante"}</strong>
                <span>
                  {member.email || "E-mail a preencher na etapa Pessoa"}
                </span>
              </p>
              <PasswordField
                label="Senha inicial"
                field="password"
                value={member.password}
                onChange={(value) => changeMember("password", value)}
                error={errors.password}
                autoComplete="new-password"
                hint="Pelo menos 12 caracteres. Compartilhe a senha diretamente com o integrante."
                disabled={busy}
              />
              <div className={`field${errors.role ? " field-invalid" : ""}`}>
                <div className="field-label">
                  <label htmlFor="access-role">Perfil</label>
                </div>
                <select
                  id="access-role"
                  value={member.role}
                  onChange={(event) => changeMember("role", event.target.value)}
                  aria-invalid={Boolean(errors.role)}
                  aria-describedby={`access-role-hint${errors.role ? " access-role-error" : ""}`}
                  disabled={busy}
                >
                  <option value="editor">Editor</option>
                  <option value="admin">Administrador</option>
                </select>
                <p className="field-hint" id="access-role-hint">
                  {member.role === "admin"
                    ? "Edita e publica conteúdos e também gerencia os acessos da equipe."
                    : "Edita e publica conteúdos do processo seletivo, contato e blog."}
                </p>
                {errors.role && (
                  <p
                    className="field-error"
                    id="access-role-error"
                    role="alert"
                  >
                    {errors.role}
                  </p>
                )}
              </div>
            </fieldset>
            <div className="access-actions">
              <Button
                disabled={busy}
                icon={ArrowLeft}
                onClick={() =>
                  memberStep === 0 ? go("team") : goMemberStep(0)
                }
              >
                {memberStep === 0 ? "Voltar à equipe" : "Voltar"}
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={busy ? LoaderCircle : Plus}
                disabled={busy}
              >
                {busy
                  ? "Criando…"
                  : memberStep === 0
                    ? "Continuar"
                    : "Criar acesso"}
              </Button>
            </div>
          </form>
        )}
        {view === "confirm" && selected && (
          <>
            <div className="access-confirm">
              <ShieldCheck size={28} />
              <h3>{selected.name}</h3>
              <span>{selected.email}</span>
              <p>
                {selected.active
                  ? "O acesso será bloqueado e as sessões encerradas. Os conteúdos serão preservados."
                  : "O acesso será liberado com o mesmo e-mail e senha."}
              </p>
            </div>
            <div className="access-actions">
              <Button
                disabled={busy}
                onClick={() => go("team")}
                data-view-focus
              >
                Cancelar
              </Button>
              <Button
                variant={selected.active ? "secondary" : "primary"}
                className={selected.active ? "access-danger" : ""}
                disabled={busy}
                icon={busy ? LoaderCircle : undefined}
                onClick={confirmAccess}
              >
                {busy
                  ? "Atualizando…"
                  : `${selected.active ? "Desativar" : "Reativar"} acesso`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
