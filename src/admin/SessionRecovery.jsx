import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import { Button, Field, Modal } from "./components";
import "./recovery-dialogs.css";

export default function SessionRecovery({
  session,
  onSession,
  onClose,
  notify,
}) {
  const localSession = session?.user?.id === "local-preview";
  const email = session?.user?.email || "";
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const passwordId = useId();
  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [errors]);

  async function login(event, local = false) {
    event?.preventDefault();
    if (requestRef.current || local !== localSession) return;
    const invalid = {};
    if (!local) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        invalid.email = "Informe seu e-mail de acesso.";
      }
      if (!password) invalid.password = "Informe sua senha para continuar.";
    }
    setErrors(invalid);
    setError("");
    if (Object.keys(invalid).length) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    try {
      const payload = await api(local ? "/api/local-session" : "/api/login", {
        method: "POST",
        body: local ? {} : { email: email.trim(), password },
        signal: controller.signal,
      });
      if (!mountedRef.current || requestRef.current !== controller) return;
      if (!payload.authenticated) {
        throw new Error("Não foi possível renovar a sessão. Tente novamente.");
      }
      if (!session?.user?.id || payload.user?.id !== session.user.id) {
        // Pending content belongs to the original account. Never transfer its
        // editor state or local recovery namespace to another authenticated user.
        await api("/api/logout", {
          method: "POST",
          body: {},
          signal: controller.signal,
        });
        throw new Error(
          "Entre com a mesma conta para recuperar esta edição. Para trocar de conta, saia do painel primeiro.",
        );
      }
      setPassword("");
      await onSession(payload);
      if (!mountedRef.current) return;
      notify?.("Sessão renovada. Sua edição foi preservada.");
      onClose();
    } catch (cause) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (!local && cause.code === "INVALID_CREDENTIALS") {
        setErrors({
          password:
            "E-mail ou senha incorretos. Confira os dados e tente novamente.",
        });
      } else {
        setError(cause.message || "Não foi possível entrar. Tente novamente.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <Modal
      title="Entre novamente para continuar"
      description="Sua sessão terminou. A edição continua aqui enquanto você renova o acesso."
      onClose={onClose}
    >
      <form
        className="session-recovery"
        ref={formRef}
        onSubmit={login}
        noValidate
      >
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {!localSession && (
          <fieldset disabled={busy} aria-busy={busy}>
            <Field
              label="E-mail"
              type="email"
              value={email}
              readOnly
              hint="Renove o acesso com a mesma conta para preservar esta edição."
              error={errors.email}
              autoComplete="username"
              maxLength={254}
              required
            />
            <div className="session-recovery-password">
              <Field
                id={passwordId}
                label="Senha"
                type={visible ? "text" : "password"}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  setErrors((current) => ({ ...current, password: undefined }));
                  setError("");
                }}
                error={errors.password}
                autoComplete="current-password"
                autoFocus={Boolean(email)}
                maxLength={1024}
                required
              />
              <button
                type="button"
                className="session-recovery-password-toggle"
                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                aria-controls={passwordId}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <Button
              type="submit"
              variant="primary"
              icon={busy ? LoaderCircle : ArrowRight}
            >
              {busy ? "Renovando acesso…" : "Entrar e continuar"}
            </Button>
          </fieldset>
        )}
        {localSession && session?.localPreview && (
          <div className="session-recovery-local">
            <span className="eyebrow">PRÉVIA NESTE COMPUTADOR</span>
            <Button
              disabled={busy}
              icon={Eye}
              onClick={(event) => login(event, true)}
            >
              Continuar na prévia local
            </Button>
          </div>
        )}
        <p className="session-recovery-note">
          <ShieldCheck size={16} aria-hidden="true" />
          Entrar novamente preserva seus textos e alterações pendentes.
        </p>
      </form>
    </Modal>
  );
}
