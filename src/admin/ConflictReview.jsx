import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Download, RefreshCw } from "lucide-react";
import { api } from "./api";
import { Button, Loading, Modal } from "./components";
import { changes, mergeDraft } from "./site-editing.cjs";
import "./recovery-dialogs.css";

export default function ConflictReview({
  base,
  local,
  onApply,
  onClose,
  onExpired,
}) {
  const [latest, setLatest] = useState(null);
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [expired, setExpired] = useState(false);
  const requestRef = useRef(null);
  const mountedRef = useRef(true);
  const applyRef = useRef(false);
  const expiredRef = useRef(onExpired);
  const formRef = useRef(null);
  const choicesId = useId();
  expiredRef.current = onExpired;

  const loadLatest = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setExpired(false);
    setLatest(null);
    try {
      const payload = await api("/api/admin/content", {
        signal: controller.signal,
      });
      if (!mountedRef.current || requestRef.current !== controller) return;
      if (!payload.draft || !Number.isSafeInteger(payload.version)) {
        throw new Error(
          "Não foi possível ler a versão da equipe. Tente novamente.",
        );
      }
      setChoices({});
      setLatest(payload);
    } catch (cause) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (cause.status === 401) {
        setExpired(true);
        setError(
          "Entre novamente para consultar a versão da equipe. Sua edição continua preservada.",
        );
        expiredRef.current?.();
      } else {
        setError(
          cause.message ||
            "Não foi possível consultar as alterações. Tente novamente.",
        );
      }
    } finally {
      if (mountedRef.current && requestRef.current === controller)
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadLatest();
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, [loadLatest]);

  const comparison = useMemo(
    () => (latest ? mergeDraft(base, local, latest.draft, choices) : null),
    [base, local, latest, choices],
  );
  const unresolved =
    comparison?.conflicts.filter(
      (field) => !["mine", "theirs"].includes(choices[field.path]),
    ) || [];
  const independent = useMemo(() => {
    if (!latest || !comparison) return [];
    const conflicted = new Set(comparison.conflicts.map((field) => field.path));
    const fields = [...changes(local, base), ...changes(latest.draft, base)];
    return Array.from(
      new Map(
        fields
          .filter((field) => !conflicted.has(field.path))
          .map((field) => [field.path, field]),
      ).values(),
    );
  }, [base, local, latest, comparison]);

  function download() {
    setDownloadError("");
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "nexo-site-draft-v1",
              exportedAt: new Date().toISOString(),
              content: local,
            },
            null,
            2,
          ),
        ],
        { type: "application/json;charset=utf-8" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexo-minha-edicao-${new Date().toISOString().slice(0, 10)}.json`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch {
      setDownloadError(
        "Não foi possível baixar a cópia. Sua edição permanece aberta; tente novamente.",
      );
    }
  }

  async function apply(event) {
    event.preventDefault();
    if (!latest || !comparison || loading || applyRef.current) return;
    if (unresolved.length) {
      formRef.current?.querySelector('[data-unresolved="true"] input')?.focus();
      return;
    }
    applyRef.current = true;
    setApplying(true);
    setError("");
    try {
      await onApply(latest, comparison.result);
    } catch (cause) {
      if (!mountedRef.current) return;
      if (cause.status === 401) expiredRef.current?.();
      setError(
        cause.message ||
          "Não foi possível aplicar as escolhas. Sua edição foi preservada.",
      );
    } finally {
      applyRef.current = false;
      if (mountedRef.current) setApplying(false);
    }
  }

  return (
    <Modal
      title="Revisar alterações da equipe"
      description="Há uma versão mais recente no painel. Confira o que manter para continuar com um único rascunho."
      onClose={onClose}
      wide
    >
      <form className="conflict-review" ref={formRef} onSubmit={apply}>
        {error && (
          <div
            className="notice notice-error conflict-review-error"
            role="alert"
          >
            <p>{error}</p>
            <Button
              icon={RefreshCw}
              disabled={loading || applying}
              onClick={expired && onExpired ? onExpired : loadLatest}
            >
              {expired ? "Entrar novamente" : "Tentar novamente"}
            </Button>
          </div>
        )}
        {loading ? (
          <Loading compact label="Consultando a versão mais recente…" />
        ) : (
          comparison && (
            <>
              {comparison.conflicts.length > 0 ? (
                <>
                  <p className="conflict-review-intro">
                    Estes campos foram alterados por você e pela equipe. Escolha
                    a versão de cada um.
                  </p>
                  <div className="conflict-review-fields">
                    {comparison.conflicts.map((field, index) => (
                      <fieldset
                        className="conflict-review-field"
                        key={field.path}
                        disabled={applying}
                        data-unresolved={
                          !["mine", "theirs"].includes(choices[field.path])
                        }
                      >
                        <legend>{field.label}</legend>
                        <div className="conflict-review-options">
                          {[
                            {
                              value: "mine",
                              label: "Minha edição",
                              text: field.mine,
                            },
                            {
                              value: "theirs",
                              label: "Versão da equipe",
                              text: field.theirs,
                            },
                          ].map((option) => (
                            <label
                              className={`conflict-review-option${choices[field.path] === option.value ? " is-selected" : ""}`}
                              key={option.value}
                            >
                              <span className="conflict-review-option-heading">
                                <input
                                  type="radio"
                                  name={`${choicesId}-${index}`}
                                  value={option.value}
                                  checked={choices[field.path] === option.value}
                                  onChange={() =>
                                    setChoices((current) => ({
                                      ...current,
                                      [field.path]: option.value,
                                    }))
                                  }
                                  aria-label={option.label}
                                  required
                                />
                                <span>{option.label}</span>
                              </span>
                              <span className="conflict-review-value">
                                {option.text}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </>
              ) : (
                <div className="conflict-review-compatible">
                  <Check size={20} aria-hidden="true" />
                  <div>
                    <strong>As edições podem ser reunidas.</strong>
                    <p>
                      Os campos alterados são diferentes ou têm o mesmo
                      conteúdo. Suas alterações e as da equipe serão
                      preservadas.
                    </p>
                  </div>
                </div>
              )}
              {independent.length > 0 && (
                <details className="conflict-review-independent">
                  <summary tabIndex={0}>
                    Campos reunidos automaticamente ({independent.length})
                  </summary>
                  <ul>
                    {independent.map((field) => (
                      <li key={field.path}>{field.label}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p
                className="conflict-review-progress"
                id={`${choicesId}-progress`}
                role="status"
              >
                {unresolved.length
                  ? `Escolha uma versão para ${unresolved.length === 1 ? "o campo restante" : `os ${unresolved.length} campos restantes`}.`
                  : "Tudo conferido. A aplicação das escolhas mantém o conteúdo como rascunho."}
              </p>
            </>
          )
        )}
        {downloadError && (
          <p className="field-error" role="alert">
            {downloadError}
          </p>
        )}
        {downloaded && (
          <p className="conflict-review-download-status" role="status">
            Download da sua edição preparado.
          </p>
        )}
        <div className="modal-actions conflict-review-actions">
          <Button icon={Download} onClick={download}>
            Baixar minha edição
          </Button>
          <div>
            <Button onClick={onClose}>Voltar à edição</Button>
            <Button
              type="submit"
              variant="primary"
              icon={Check}
              disabled={
                !comparison || loading || applying || unresolved.length > 0
              }
              aria-describedby={
                comparison ? `${choicesId}-progress` : undefined
              }
            >
              {applying ? "Aplicando escolhas…" : "Aplicar escolhas"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
