import React, { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  Monitor,
} from "lucide-react";
import { Button, Modal } from "./components";

export default function PublicationSuccess({ publication, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [copying, setCopying] = useState(false);
  const copyingRef = useRef(false);
  const local = publication.local;
  const title = local
    ? "Publicado na prévia local!"
    : publication.updated
      ? "Alterações publicadas!"
      : publication.kind === "article"
        ? "Seu artigo está no ar!"
        : "Seu site está atualizado!";
  const url = new URL(publication.href, window.location.origin).href;

  async function copy() {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    setCopied(false);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} className="publication-success">
      <div className="success-symbol" aria-hidden="true">
        <Check size={52} strokeWidth={2} />
      </div>
      <div className="success-content">
        <p className="success-description">
          {local
            ? "Tudo pronto neste computador. Esta publicação fica no ambiente de apresentação."
            : publication.kind === "article"
              ? "A versão publicada já está disponível para os leitores do Nexo."
              : "As informações revisadas já estão disponíveis no site do Nexo."}
        </p>
        <div className="success-publication">
          {publication.cover ? (
            <img
              src={publication.cover}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : (
            <Globe size={24} aria-hidden="true" />
          )}
          <div>
            <span>
              {publication.kind === "article"
                ? "Blog do Nexo"
                : "Nexo Governamental"}
            </span>
            <strong>{publication.title}</strong>
          </div>
          <Check size={20} aria-hidden="true" />
        </div>
        <div className="success-actions">
          <a
            className="button success-primary"
            href={publication.href}
            target="_blank"
            rel="noreferrer"
          >
            {publication.kind === "article" ? "Ver publicação" : "Ver site"}
            <ArrowUpRight size={18} />
          </a>
          <Button
            className="success-secondary"
            icon={copied ? Check : Copy}
            onClick={copy}
            disabled={copying}
            aria-busy={copying}
          >
            {copying
              ? "Copiando…"
              : copied
                ? "Link copiado"
                : local
                  ? "Copiar link local"
                  : "Copiar link"}
          </Button>
        </div>
        <p className="success-copy-state sr-only" role="status">
          {copied ? "Link copiado para a área de transferência." : ""}
        </p>
        {copyError && (
          <label className="success-copy-fallback">
            Selecione e copie o endereço
            <input
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        <button className="success-return" onClick={onClose}>
          Continuar no painel <ArrowRight size={16} />
        </button>
        <span className="success-signature">
          {local && <Monitor size={14} />}{" "}
          {local ? "Prévia local" : "Nexo Studio"}
        </span>
      </div>
    </Modal>
  );
}
