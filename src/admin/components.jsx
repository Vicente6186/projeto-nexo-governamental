import React, { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { X, LoaderCircle, Image as ImageIcon } from "lucide-react";

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
  error,
  value,
  onChange,
  multiline = false,
  type = "text",
  maxLength,
  ...props
}) {
  const generatedId = useId();
  const id = props.id || generatedId;
  const Component = multiline ? "textarea" : "input";
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [props["aria-describedby"], hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
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
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
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
const modalBackground = new Map();
let modalCount = 0;
let bodyOverflowBeforeModal = "";

function concealBehindModal(element) {
  const saved = modalBackground.get(element) || {
    count: 0,
    inert: element.getAttribute("inert"),
    hidden: element.getAttribute("aria-hidden"),
  };
  saved.count += 1;
  modalBackground.set(element, saved);
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
}

function restoreBehindModal(element) {
  const saved = modalBackground.get(element);
  if (!saved || --saved.count > 0) return;
  for (const [attribute, value] of [
    ["inert", saved.inert],
    ["aria-hidden", saved.hidden],
  ]) {
    if (value === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, value);
  }
  modalBackground.delete(element);
}

export function Modal({ title, description, children, onClose, wide = false }) {
  const ref = useRef(null),
    backdropRef = useRef(null),
    previous = useRef(document.activeElement),
    closeRef = useRef(onClose),
    titleId = useId(),
    descriptionId = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const backdrop = backdropRef.current;
    if (!dialog || !backdrop) return undefined;
    let active = true;
    const focusableSelector =
      'button:not([disabled]),a[href],summary,input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[contenteditable="true"],[tabindex]';
    function frameDocument(frame) {
      try {
        return frame.contentDocument;
      } catch {
        return null;
      }
    }
    function visible(element) {
      return (
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0 &&
        element.ownerDocument.defaultView.getComputedStyle(element)
          .visibility !== "hidden"
      );
    }
    function focusableItems(container) {
      return Array.from(container.querySelectorAll(focusableSelector))
        .filter(visible)
        .flatMap((element) => {
          if (element.tagName !== "IFRAME") return [element];
          const doc = frameDocument(element);
          const children = doc ? focusableItems(doc) : [];
          return children.length ? children : [element];
        });
    }
    function activeElement(doc = document) {
      const active = doc.activeElement;
      const childDocument =
        active?.tagName === "IFRAME" && frameDocument(active);
      return childDocument ? activeElement(childDocument) : active;
    }
    function keyDown(event) {
      if (event.defaultPrevented || dialog.closest("[inert]")) return;
      connectFrames(dialog);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableItems(dialog);
      event.preventDefault();
      if (!items.length) {
        dialog.focus();
        return;
      }
      const current = items.indexOf(activeElement());
      const next = event.shiftKey
        ? (current <= 0 ? items.length : current) - 1
        : (current + 1) % items.length;
      items[next].focus();
    }

    // Preview documents have their own event tree. Register each same-origin
    // document so Tab and Escape follow one continuous dialog focus order.
    const frames = new Map();
    let frameCheck = null;
    function connectFrames(container) {
      container.querySelectorAll("iframe").forEach((frame) => {
        const current = frames.get(frame);
        if (current) {
          if (current.document !== frameDocument(frame))
            current.connectDocument();
          return;
        }
        const entry = { document: null, observer: null };
        function connectDocument() {
          const nextDocument = frameDocument(frame);
          if (entry.document === nextDocument && entry.observer) return;
          entry.document?.removeEventListener("keydown", keyDown);
          entry.observer?.disconnect();
          entry.document = nextDocument;
          if (!entry.document) return;
          entry.document.addEventListener("keydown", keyDown);
          connectFrames(entry.document);
          entry.observer = new MutationObserver(() =>
            connectFrames(entry.document),
          );
          entry.observer.observe(entry.document, {
            childList: true,
            subtree: true,
          });
        }
        entry.connectDocument = connectDocument;
        frames.set(frame, entry);
        frame.addEventListener("load", connectDocument);
        frame.addEventListener("focus", connectDocument);
        connectDocument();
      });
      // The document becomes usable before iframe.load when images or embeds
      // are still pending. Reconnect during that gap and after link navigation.
      if (frames.size && frameCheck === null) {
        frameCheck = window.setInterval(() => connectFrames(dialog), 100);
      }
    }
    function refreshFocusedFrame() {
      connectFrames(dialog);
      queueMicrotask(() => {
        if (active && dialog.isConnected) connectFrames(dialog);
      });
    }
    dialog.addEventListener("keydown", keyDown);
    document.addEventListener("focusin", refreshFocusedFrame);
    window.addEventListener("blur", refreshFocusedFrame);
    connectFrames(dialog);
    const frameObserver = new MutationObserver(() => connectFrames(dialog));
    frameObserver.observe(dialog, { childList: true, subtree: true });

    if (!dialog.contains(document.activeElement)) {
      const input = Array.from(
        dialog.querySelectorAll(
          "input:not([type=file]):not([type=hidden]),textarea,select",
        ),
      ).find(visible);
      (input || dialog).focus();
    }

    const background = Array.from(document.body.children).filter(
      (element) => element !== backdrop,
    );
    background.forEach(concealBehindModal);
    if (modalCount === 0)
      bodyOverflowBeforeModal = document.body.style.overflow;
    modalCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      active = false;
      dialog.removeEventListener("keydown", keyDown);
      document.removeEventListener("focusin", refreshFocusedFrame);
      window.removeEventListener("blur", refreshFocusedFrame);
      window.clearInterval(frameCheck);
      frameObserver.disconnect();
      frames.forEach((entry, frame) => {
        frame.removeEventListener("load", entry.connectDocument);
        frame.removeEventListener("focus", entry.connectDocument);
        entry.document?.removeEventListener("keydown", keyDown);
        entry.observer?.disconnect();
      });
      background.forEach(restoreBehindModal);
      modalCount -= 1;
      if (modalCount === 0)
        document.body.style.overflow = bodyOverflowBeforeModal;
      if (
        previous.current?.isConnected &&
        !previous.current.closest("[inert]")
      ) {
        previous.current.focus({ preventScroll: true });
      }
    };
  }, []);
  return createPortal(
    <div
      ref={backdropRef}
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
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar janela"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
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
export function Loading({ label = "Preparando seu espaço…", compact = false }) {
  return (
    <div
      className={`loading${compact ? " loading-compact" : ""}`}
      role="status"
    >
      <LoaderCircle className="spin" size={24} aria-hidden="true" />
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
export function dateLabel(value, withTime = false) {
  if (!value) return "Ainda não publicado";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value,
  );
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(date);
}
export function dayLabel(value) {
  if (!value) return "A definir";
  const date = new Date(`${value}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
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
