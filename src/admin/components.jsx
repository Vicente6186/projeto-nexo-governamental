import React, { useEffect, useRef, useId } from "react";
import {
  X,
  ArrowUpRight,
  LoaderCircle,
  Image as ImageIcon,
} from "lucide-react";

export function Button({
  children,
  variant = "secondary",
  className = "",
  icon: Icon,
  ...props
}) {
  return (
    <button
      type="button"
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function Badge({ children, tone = "neutral", dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Field({
  label,
  hint,
  value,
  onChange,
  multiline = false,
  type = "text",
  maxLength,
  ...props
}) {
  const id = useId();
  const Component = multiline ? "textarea" : "input";
  const hintId = `${id}-hint`;
  const describedBy =
    [props["aria-describedby"], hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {maxLength && (
          <span
            className={`field-count ${String(value || "").length >= maxLength * 0.9 ? "is-near-limit" : ""}`}
          >
            {String(value || "").length}/{maxLength}
          </span>
        )}
      </div>
      <Component
        id={id}
        type={multiline ? undefined : type}
        rows={multiline ? 4 : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        {...props}
        aria-describedby={describedBy}
      />
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
export function Tabs({ label, value, onChange, tabs, panelId }) {
  const ref = useRef(null);
  function keyDown(event, index) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    ref.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }
  return (
    <div ref={ref} className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          id={`${panelId}-tab-${tab.id}`}
          role="tab"
          aria-controls={panelId}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          className={value === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => keyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Modal({ title, description, children, onClose, wide = false }) {
  const ref = useRef(null),
    previous = useRef(document.activeElement),
    titleId = useId();
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) {
      const input = ref.current?.querySelector(
        "input:not([type=file]), textarea, select",
      );
      (input || ref.current)?.focus();
    }
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);
  function keyDown(e) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(
      ref.current.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ).filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0],
      last = items.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === ref.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keyDown}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Fechar janela"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  icon: Icon = ImageIcon,
  title,
  description,
  children,
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Loading({ label = "Preparando seu espaço…" }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function CardHeading({ eyebrow, title, children }) {
  return (
    <div className="card-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function AssetField({
  label,
  value,
  onChange,
  assets,
  accept = "image",
  onBrowse,
}) {
  return (
    <div className="asset-field">
      <Field
        label={label}
        value={value}
        onChange={onChange}
        placeholder="/assets/imagem.webp ou https://…"
      />
      <div className="asset-field-bottom">
        {value && accept === "image" && (
          <img
            src={value}
            alt="Prévia do arquivo"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            onLoad={(e) => {
              e.currentTarget.style.visibility = "visible";
            }}
          />
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => onBrowse({ accept, onSelect: onChange })}
        >
          <ImageIcon size={15} /> Escolher na biblioteca{" "}
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}
export const LABELS = {
  id: "Identificador",
  title: "Título",
  description: "Descrição",
  detail: "Texto complementar",
  image: "Imagem",
  alt: "Descrição da imagem (acessibilidade)",
  url: "Link",
  listTitle: "Título da lista",
  videoTitle: "Título do vídeo",
  videoDescription: "Descrição do vídeo",
  invitation: "Convite",
  civilLabel: "Comunidade civil",
  executiveLabel: "Poder Executivo",
  legislativeLabel: "Poder Legislativo",
  judiciaryLabel: "Poder Judiciário",
  republicLabel: "República",
  galleryTitle: "Título da galeria",
  communityTitle: "Título dos números",
  membersValue: "Número de membros",
  membersLabel: "Rótulo de membros",
  universitiesValue: "Número de universidades",
  universitiesLabel: "Rótulo de universidades",
  profileTitle: "Nome do perfil",
  profileSubtitle: "Complemento do perfil",
  institution: "Instituição",
  profileCta: "Texto do link do perfil",
  availability: "Disponibilidade da equipe",
  emailLabel: "Rótulo do e-mail",
  formTitle: "Título do formulário",
  formDescription: "Orientação do formulário",
  formHelp: "Ajuda do formulário",
  submitLabel: "Texto do botão de contato",
  schoolCategory: "Categoria: escolas",
  eventsCategory: "Categoria: eventos",
  travelCategory: "Categoria: viagens",
};
export function dateLabel(value, withTime = false) {
  if (!value) return "Ainda não publicado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        ...(withTime
          ? { hour: "2-digit", minute: "2-digit" }
          : { year: "numeric" }),
      }).format(date);
}
export function dayLabel(value) {
  if (!value) return "A definir";
  return new Date(value + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
export function effectiveStatus(s) {
  const now = new Date();
  if (s.status === "closed")
    return {
      label: "Inscrições encerradas",
      short: "Encerrado",
      tone: "neutral",
    };
  if (
    s.status === "upcoming" ||
    (s.opensAt && now < new Date(s.opensAt + "T00:00:00-03:00"))
  )
    return { label: "Em preparação", short: "Em breve", tone: "amber" };
  if (s.closesAt && now > new Date(s.closesAt + "T23:59:59-03:00"))
    return { label: "Prazo encerrado", short: "Encerrado", tone: "neutral" };
  return { label: "Inscrições abertas", short: "Aberto", tone: "green" };
}
export function bytesLabel(n) {
  return n
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
        n / 1024 / 1024,
      ) + " MB"
    : "Arquivo do site";
}
