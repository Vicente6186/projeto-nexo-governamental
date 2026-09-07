import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Link2Off,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import { Button, Field } from "./components";
import "./password-reset.css";

// The email link carries its credential only in the fragment. App removes that
// fragment after capturing this value; it is never persisted or rendered.
export function passwordResetRoute(hash = "") {
  const [route, query = ""] = String(hash).replace(/^#/, "").split("?");
  if (route === "esqueci-senha")
    return { mode: "request", id: crypto.randomUUID() };
  if (route !== "redefinir-senha") return null;
  const params = new URLSearchParams(query);
  const candidate = params.get("token") || "";
  const valid =
    params.getAll("token").length === 1 && /^[a-f0-9]{64}$/.test(candidate);
  return {
    mode: "confirm",
    token: valid ? candidate : "",
    invalid: !valid,
    id: crypto.randomUUID(),
  };
}

const GENERIC_SENT =
  "Se este e-mail estiver associado a uma conta ativa, você receberá as instruções para criar uma nova senha.";
function networkMessage(error) {
  if (["NETWORK_ERROR", "INVALID_RESPONSE", "TIMEOUT"].includes(error.code))
    return "Não foi possível confirmar a resposta. Verifique a conexão e tente novamente.";
  if (error.status === 429)
    return "Você fez várias tentativas. Aguarde um momento antes de tentar novamente.";
  if (error.status === 503)
    return "A recuperação por e-mail está indisponível no momento. Tente mais tarde ou procure uma pessoa administradora da equipe.";
  return error.message || "Não foi possível concluir. Tente novamente.";
}
function invalidToken(error) {
  return (
    error.field === "token" ||
    error.status === 410 ||
    /(?:TOKEN|LINK).*(?:INVALID|EXPIRED|USED)|(?:INVALID|EXPIRED|USED).*(?:TOKEN|LINK)/i.test(
      error.code || "",
    ) ||
    (error.status === 400 && error.field !== "password")
  );
}
function PasswordField({
  label,
  value,
  onChange,
  error,
  placeholder,
  toggleLabel,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="reset-password-field">
      <Field
        id={id}
        label={label}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        error={error}
        placeholder={placeholder}
        autoComplete="new-password"
        minLength={12}
        maxLength={1024}
        required
        spellCheck={false}
        autoCapitalize="none"
      />
      <button
        type="button"
        className="reset-password-toggle"
        aria-controls={id}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${toggleLabel}`}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function PasswordReset({
  intent,
  available,
  onBack,
  onRequest,
  onTokenConsumed,
}) {
  const [email, setEmail] = useState(intent.email || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState(
    intent.mode === "request"
      ? "request"
      : intent.invalid
        ? "invalid"
        : "confirm",
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const operation = useRef(false);
  const title = useRef(null);
  const form = useRef(null);
  const alive = useRef(true);
  const controller = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    title.current?.focus();
  }, [phase]);
  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    if (!resendAt) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);
  function cooldown(seconds = 60) {
    const delay = Math.min(900, Math.max(1, Number(seconds) || 60));
    setRemaining(delay);
    setResendAt(Date.now() + delay * 1000);
  }
  function focusInvalid() {
    requestAnimationFrame(() =>
      form.current?.querySelector('[aria-invalid="true"]')?.focus(),
    );
  }
  async function requestLink(event) {
    event?.preventDefault();
    if (operation.current || !available || remaining > 0) return;
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) {
      setErrors({
        email: "Informe um e-mail válido para receber as instruções.",
      });
      focusInvalid();
      return;
    }
    operation.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await api("/api/password-reset/request", {
        method: "POST",
        body: { email: address },
        signal: controller.current.signal,
      });
      if (!alive.current) return;
      setEmail(address);
      cooldown();
      setPhase("sent");
    } catch (error) {
      if (!alive.current || error.code === "CANCELLED") return;
      if (error.field === "email") {
        setErrors({ email: error.message });
        focusInvalid();
      } else setMessage(networkMessage(error));
      if (error.status === 429) cooldown(error.retryAfter || 60);
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function confirmPassword(event) {
    event.preventDefault();
    if (operation.current || remaining > 0) return;
    const invalid = {};
    if (password.length < 12)
      invalid.password = "Use uma senha com pelo menos 12 caracteres.";
    else if (password.length > 1024)
      invalid.password = "Use uma senha com até 1.024 caracteres.";
    if (!confirmation || password !== confirmation)
      invalid.confirmation = "As senhas precisam ser iguais.";
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      focusInvalid();
      return;
    }
    if (!intent.token) {
      setPhase("invalid");
      return;
    }
    operation.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await api("/api/password-reset/confirm", {
        method: "POST",
        body: { token: intent.token, password },
        signal: controller.current.signal,
      });
      if (!alive.current) return;
      setPassword("");
      setConfirmation("");
      setPhase("complete");
      onTokenConsumed();
    } catch (error) {
      if (!alive.current || error.code === "CANCELLED") return;
      if (invalidToken(error)) {
        setPassword("");
        setConfirmation("");
        setPhase("invalid");
        onTokenConsumed();
      } else if (error.field === "password") {
        setErrors({ password: error.message });
        focusInvalid();
      } else setMessage(networkMessage(error));
      if (error.status === 429) cooldown(error.retryAfter || 60);
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const headings = {
    request: "Recupere seu acesso.",
    sent: "Confira seu e-mail.",
    confirm: "Crie sua nova senha.",
    complete: "Sua senha foi atualizada.",
    invalid: "Vamos renovar seu acesso.",
  };
  const descriptions = {
    request: "Informe o e-mail que você usa para entrar no Nexo Studio.",
    sent: GENERIC_SENT,
    confirm: "Escolha uma senha para continuar cuidando dos conteúdos do Nexo.",
    complete: "Tudo certo. Entre no painel com sua nova senha.",
    invalid:
      "Este link não é válido, expirou ou já foi utilizado. Solicite um novo link para continuar.",
  };
  const Icon =
    phase === "complete"
      ? CheckCircle2
      : phase === "sent"
        ? Mail
        : phase === "invalid"
          ? Link2Off
          : phase === "confirm"
            ? LockKeyhole
            : Mail;
  return (
    <section className="password-reset" aria-labelledby="password-reset-title">
      <a
        href="#entrar"
        className="reset-back"
        onClick={(event) => {
          event.preventDefault();
          if (!busy) onBack();
        }}
        aria-disabled={busy || undefined}
      >
        <ArrowLeft size={16} /> Voltar ao login
      </a>
      <div
        className={`reset-symbol ${phase === "complete" ? "is-complete" : ""}`}
      >
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <span className="eyebrow">ACESSO AO NEXO STUDIO</span>
      <h2 id="password-reset-title" ref={title} tabIndex={-1}>
        {headings[phase]}
      </h2>
      <p className="reset-description">{descriptions[phase]}</p>
      {message && (
        <div className="notice notice-error" role="alert">
          {message}
        </div>
      )}
      {!available && ["request", "sent", "invalid"].includes(phase) && (
        <div className="reset-unavailable" role="status">
          <ShieldCheck size={18} />
          <p>
            A recuperação por e-mail ainda não está configurada neste painel.
            Procure uma pessoa administradora da equipe para recuperar seu
            acesso.
          </p>
        </div>
      )}
      {phase === "request" && (
        <form
          ref={form}
          onSubmit={requestLink}
          noValidate
          aria-labelledby="password-reset-title"
        >
          <fieldset disabled={busy || !available} aria-busy={busy}>
            <Field
              label="E-mail de acesso"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setErrors({});
                setMessage("");
              }}
              error={errors.email}
              placeholder="seu.email@exemplo.com"
              autoComplete="username"
              maxLength={254}
              required
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              icon={busy ? LoaderCircle : ArrowRight}
              disabled={remaining > 0}
            >
              {busy
                ? "Enviando link…"
                : remaining > 0
                  ? `Tentar novamente em ${remaining} s`
                  : "Enviar link de recuperação"}
            </Button>
          </fieldset>
          <p className="reset-note">
            O link permite criar uma nova senha. Ele só pode ser utilizado uma
            vez.
          </p>
        </form>
      )}
      {phase === "sent" && (
        <div className="reset-sent-content">
          <p className="reset-inbox-note">
            O e-mail pode levar alguns minutos. Confira também as pastas de spam
            e lixo eletrônico.
          </p>
          <Button variant="primary" className="w-full" onClick={onBack}>
            Voltar para entrar
          </Button>
          <div className="reset-resend">
            <Button
              onClick={requestLink}
              disabled={!available || busy || remaining > 0}
              icon={busy ? LoaderCircle : Mail}
            >
              {busy
                ? "Enviando link…"
                : remaining > 0
                  ? `Reenviar em ${remaining} s`
                  : "Enviar outro link"}
            </Button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setPhase("request");
                setMessage("");
              }}
            >
              Corrigir e-mail
            </button>
          </div>
        </div>
      )}
      {phase === "confirm" && (
        <form
          ref={form}
          onSubmit={confirmPassword}
          noValidate
          aria-labelledby="password-reset-title"
        >
          <fieldset disabled={busy} aria-busy={busy}>
            <PasswordField
              label="Nova senha"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setErrors((current) => ({
                  ...current,
                  password: "",
                  confirmation: "",
                }));
                setMessage("");
              }}
              error={errors.password}
              placeholder="Crie uma senha de pelo menos 12 caracteres"
              toggleLabel="nova senha"
            />
            <PasswordField
              label="Confirme a nova senha"
              value={confirmation}
              onChange={(value) => {
                setConfirmation(value);
                setErrors((current) => ({ ...current, confirmation: "" }));
              }}
              error={errors.confirmation}
              placeholder="Digite a mesma senha novamente"
              toggleLabel="confirmação da senha"
            />
            <p
              className={`reset-password-hint ${password.length >= 12 ? "is-valid" : ""}`}
            >
              <Check size={15} /> Pelo menos 12 caracteres.
            </p>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              icon={busy ? LoaderCircle : LockKeyhole}
              disabled={remaining > 0}
            >
              {busy
                ? "Atualizando senha…"
                : remaining > 0
                  ? `Tentar novamente em ${remaining} s`
                  : "Salvar nova senha"}
            </Button>
          </fieldset>
          <p className="reset-note">
            Depois de salvar, entre novamente no painel. Seus conteúdos
            permanecem preservados.
          </p>
        </form>
      )}
      {phase === "invalid" && (
        <div className="reset-final-actions">
          <Button
            className="w-full"
            variant="primary"
            icon={Mail}
            onClick={() => onRequest(email)}
            disabled={!available}
          >
            Solicitar novo link
          </Button>
          <p className="reset-note">
            Se você recarregou esta página antes de concluir, abra novamente o
            link recebido por e-mail.
          </p>
        </div>
      )}
      {phase === "complete" && (
        <div className="reset-final-actions">
          <Button
            className="w-full"
            variant="primary"
            icon={ArrowRight}
            onClick={onBack}
          >
            Entrar com a nova senha
          </Button>
        </div>
      )}
      <div className="login-foot">
        <ShieldCheck size={15} /> Acesso exclusivo à equipe responsável pelo
        site.
      </div>
    </section>
  );
}
