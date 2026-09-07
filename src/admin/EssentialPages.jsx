import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AtSign,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  LockKeyhole,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Button, Field, dateLabel, effectiveStatus } from "./components";
import "./essentials.css";

const STATUS_OPTIONS = [
  {
    value: "upcoming",
    label: "Em breve",
    description: "Abertura manual, quando estiver pronto.",
    Icon: Clock3,
  },
  {
    value: "open",
    label: "Inscrições abertas",
    description: "Inscrições conforme as datas abaixo.",
    Icon: CheckCircle2,
  },
  {
    value: "closed",
    label: "Encerrado",
    description: "Finalize este processo.",
    Icon: LockKeyhole,
  },
];

function fullDate(value) {
  if (!value) return "A definir";
  const date = new Date(`${value}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function safeLink(value) {
  if (!value) return null;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function fieldError(errors, name) {
  return (
    errors[name] || name.split(".").reduce((value, key) => value?.[key], errors)
  );
}

function documentName(url, asset) {
  if (asset?.name) return asset.name;
  try {
    const parsed = new URL(url, window.location.origin);
    const name = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    return /\.pdf$/i.test(name) ? name : "Edital do processo seletivo";
  } catch {
    return "Edital do processo seletivo";
  }
}

function fileSize(size) {
  const megabytes = size / 1024 / 1024;
  return megabytes >= 1
    ? `${megabytes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function instagramProfile(value) {
  const raw = value.trim();
  if (!raw) return { handle: "", url: "" };
  let username = raw.replace(/^@/, "");
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(raw)) {
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
      );
      if (
        !["instagram.com", "www.instagram.com"].includes(
          parsed.hostname.toLowerCase(),
        ) ||
        parsed.username ||
        parsed.password
      )
        return null;
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length !== 1) return null;
      username = segments[0];
    } catch {
      return null;
    }
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
  return {
    handle: `@${username}`,
    url: `https://www.instagram.com/${username}/`,
  };
}

const WORKSPACES = [
  {
    route: "processo",
    title: "Processo seletivo",
    description: "Atualize a edição, os prazos e as inscrições.",
    action: "Gerenciar seleção",
    Icon: CalendarDays,
  },
  {
    route: "blog",
    title: "Blog do Nexo",
    description: "Dê espaço às ideias, pesquisas e histórias do Nexo.",
    action: "Gerenciar artigos",
    Icon: BookOpen,
  },
  {
    route: "contato",
    title: "Contato",
    description: "Mantenha os canais da equipe sempre acessíveis.",
    action: "Atualizar contato",
    Icon: Mail,
  },
];

export function Overview({
  content,
  state,
  dirty,
  pending,
  navigate,
  onPreview,
  onPublish,
  busy,
}) {
  const selection = state.published.selection;
  const status = effectiveStatus(selection);
  const hasChanges = dirty || pending;
  const selectionChanged =
    JSON.stringify(content.selection) !== JSON.stringify(selection);
  return (
    <div className="essentials-overview">
      <section className="essentials-welcome">
        <div>
          <h2>O Nexo, sempre em dia.</h2>
          <p>O essencial para cuidar da presença do Nexo.</p>
        </div>
        <div className="essentials-welcome-mark" aria-hidden="true">
          <img
            src="/assets/introduction/brand-without-background.webp"
            alt=""
          />
        </div>
      </section>

      <div className="essentials-actions" aria-label="Áreas do painel">
        {WORKSPACES.map(({ route, title, description, action, Icon }) => (
          <button
            type="button"
            className="essentials-action"
            key={route}
            onClick={() => navigate(route)}
            aria-label={title}
          >
            <span className="essentials-action-icon">
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="essentials-action-link">
              {action}
              <ArrowUpRight size={16} />
            </span>
          </button>
        ))}
      </div>

      <div className="essentials-summary-grid">
        <section className="essentials-card essentials-selection-summary">
          <div className="essentials-card-heading">
            <div>
              <h2>Processo seletivo</h2>
              <span className="essentials-summary-caption">
                Publicado no site
              </span>
            </div>
            <Badge tone={status.tone} dot>
              {status.short}
            </Badge>
          </div>
          <p className="essentials-edition">
            {selection.edition || "Próxima edição"}
          </p>
          <dl className="essentials-dates">
            <div>
              <dt>Abertura</dt>
              <dd>{fullDate(selection.opensAt)}</dd>
            </div>
            <div>
              <dt>Encerramento</dt>
              <dd>{fullDate(selection.closesAt)}</dd>
            </div>
          </dl>
          {selectionChanged && (
            <p className="essentials-draft-note">
              <Clock3 size={15} /> Há alterações no rascunho. A situação acima
              só muda após publicar.
            </p>
          )}
          <button
            type="button"
            className="text-button essentials-summary-link"
            onClick={() => navigate("processo")}
          >
            Atualizar processo <ArrowRight size={15} />
          </button>
        </section>

        <section className="essentials-card essentials-publication-summary">
          <div className="essentials-card-heading">
            <h2>Atualizações do site</h2>
            <span
              className={`essentials-publication-dot ${hasChanges ? "is-pending" : ""}`}
              aria-hidden="true"
            />
          </div>
          <h3>
            {dirty
              ? "Alterações em edição"
              : pending
                ? "Rascunho pronto para revisar"
                : "Dados do site publicados"}
          </h3>
          <p>
            {hasChanges
              ? "Confira os dados do processo seletivo e do contato antes de publicar."
              : "Os dados salvos estão publicados. Os artigos são gerenciados no blog."}
          </p>
          <span className="essentials-publication-date">
            Última publicação: {dateLabel(state.publishedAt, true)}
          </span>
          <div className="essentials-publication-actions">
            {hasChanges ? (
              <Button
                variant="primary"
                icon={Send}
                onClick={onPublish}
                disabled={busy}
              >
                Revisar publicação
              </Button>
            ) : (
              <Button onClick={onPreview} disabled={busy} icon={ArrowUpRight}>
                Ver prévia do site
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function SelectionEditor({
  selection,
  onChange,
  disabled,
  onUploadNotice,
  uploading,
  assets = [],
  errors = {},
}) {
  const statusName = useId();
  const uploadRef = useRef(null);
  const stageListRef = useRef(null);
  const addStageRef = useRef(null);
  const focusStageRef = useRef(null);
  const [removedStage, setRemovedStage] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const stages = selection.stages || [];
  const status = effectiveStatus(selection);
  const noticeLink = safeLink(selection.noticeUrl);
  const applicationLink = safeLink(selection.applicationUrl);
  const noticeAsset = assets.find((asset) => asset.url === selection.noticeUrl);
  const errorFor = (name) => fieldError(errors, `selection.${name}`);

  useEffect(() => {
    if (!focusStageRef.current) return;
    if (focusStageRef.current === "add") {
      addStageRef.current?.focus();
    } else {
      const row = Array.from(stageListRef.current?.children || []).find(
        (item) => item.dataset.stageId === focusStageRef.current,
      );
      row?.querySelector("input")?.focus();
    }
    focusStageRef.current = null;
  }, [stages]);

  function updateStage(index, patch) {
    onChange({
      stages: stages.map((stage, i) =>
        i === index ? { ...stage, ...patch } : stage,
      ),
    });
  }
  function moveStage(index, direction) {
    const reordered = [...stages];
    [reordered[index], reordered[index + direction]] = [
      reordered[index + direction],
      reordered[index],
    ];
    onChange({ stages: reordered });
  }
  function removeStage(index) {
    setRemovedStage({ stage: stages[index], index });
    focusStageRef.current =
      stages[index + 1]?.id || stages[index - 1]?.id || "add";
    onChange({ stages: stages.filter((_, i) => i !== index) });
  }
  function undoRemoveStage() {
    if (!removedStage || stages.length >= 30) return;
    const restored = [...stages];
    restored.splice(
      Math.min(removedStage.index, restored.length),
      0,
      removedStage.stage,
    );
    focusStageRef.current = removedStage.stage.id;
    onChange({ stages: restored });
    setRemovedStage(null);
  }
  function addStage() {
    const id = crypto.randomUUID();
    focusStageRef.current = id;
    onChange({
      stages: [...stages, { id, title: "", date: "", description: "" }],
    });
  }

  return (
    <div className="essentials-editor">
      <section className="essentials-card">
        <header className="essentials-section-heading">
          <span className="essentials-heading-icon">
            <CalendarDays size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h2>Inscrições</h2>
            <p>Os dados que os candidatos precisam para participar.</p>
          </div>
        </header>
        <fieldset className="essentials-form" disabled={disabled}>
          <fieldset className="essentials-status-fieldset">
            <legend>Situação do processo</legend>
            <div className="essentials-status-options">
              {STATUS_OPTIONS.map(({ value, label, description, Icon }) => (
                <label
                  key={value}
                  className={`essentials-status-option ${selection.status === value ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={statusName}
                    value={value}
                    checked={selection.status === value}
                    onChange={() => onChange({ status: value })}
                    aria-label={label}
                    data-field="selection.status"
                    aria-invalid={errorFor("status") ? true : undefined}
                    aria-describedby={
                      errorFor("status") ? `${statusName}-error` : undefined
                    }
                  />
                  <span className="essentials-status-top">
                    <Icon size={18} strokeWidth={1.7} />
                    <span className="essentials-radio-mark">
                      {selection.status === value && (
                        <Check size={11} strokeWidth={3} />
                      )}
                    </span>
                  </span>
                  <strong>{label}</strong>
                  <span>{description}</span>
                </label>
              ))}
            </div>
            {errorFor("status") && (
              <p
                className="field-error"
                role="alert"
                id={`${statusName}-error`}
              >
                {errorFor("status")}
              </p>
            )}
          </fieldset>

          <Field
            label="Edição do processo"
            value={selection.edition}
            onChange={(edition) => onChange({ edition })}
            placeholder="Ex.: Processo seletivo 2026.2"
            maxLength={100}
            data-field="selection.edition"
            error={errorFor("edition")}
          />
          <div className="essentials-field-row">
            <Field
              label="Abertura das inscrições"
              type="date"
              value={selection.opensAt}
              onChange={(opensAt) => onChange({ opensAt })}
              data-field="selection.opensAt"
              error={errorFor("opensAt")}
            />
            <Field
              label="Encerramento das inscrições"
              type="date"
              value={selection.closesAt}
              onChange={(closesAt) => onChange({ closesAt })}
              min={selection.opensAt || undefined}
              data-field="selection.closesAt"
              error={errorFor("closesAt")}
            />
          </div>
          <div className="essentials-status-note">
            <Clock3 size={15} />
            <div>
              <p>
                {selection.status === "upcoming"
                  ? "“Em breve” mantém as inscrições fechadas até você mudar a situação. Para abrir automaticamente na data definida, selecione “Inscrições abertas”."
                  : selection.status === "closed"
                    ? "“Encerrado” mantém as inscrições fechadas, independentemente das datas."
                    : "As inscrições abrem na data inicial e encerram ao final da data limite. Sem datas, ficam abertas até você encerrar o processo."}
              </p>
              <p>
                Se publicar agora:{" "}
                <strong>{status.label.toLocaleLowerCase("pt-BR")}.</strong>{" "}
                Datas no horário de Brasília: abertura às 00h e encerramento às
                23h59.
              </p>
            </div>
          </div>

          <div className="essentials-form-divider" />
          <Field
            label="Link do formulário de inscrição"
            value={selection.applicationUrl}
            onChange={(applicationUrl) => onChange({ applicationUrl })}
            placeholder="https://forms.gle/…"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
            hint="Necessário para publicar um processo com inscrições abertas."
            data-field="selection.applicationUrl"
            error={errorFor("applicationUrl")}
          />
          {applicationLink && (
            <a
              className="essentials-inline-link"
              href={applicationLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Testar formulário <ArrowUpRight size={15} />
            </a>
          )}
          <Field
            label="Link do edital"
            value={selection.noticeUrl}
            onChange={(noticeUrl) => onChange({ noticeUrl })}
            placeholder="Cole o link do documento ou envie um PDF"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
            data-field="selection.noticeUrl"
            error={errorFor("noticeUrl")}
            disabled={disabled || uploading}
            hint="Use o edital oficial ou envie um PDF de até 8 MB."
          />
          {noticeLink && (
            <div className="essentials-document-card">
              <span className="essentials-document-icon">
                <FileText size={21} />
              </span>
              <div className="essentials-document-info">
                <strong>
                  {documentName(selection.noticeUrl, noticeAsset)}
                </strong>
                <span>
                  {noticeAsset?.size
                    ? `PDF · ${fileSize(noticeAsset.size)}`
                    : selection.noticeUrl.startsWith("/uploads/")
                      ? "Documento enviado ao painel"
                      : new URL(noticeLink).hostname}
                </span>
              </div>
              <div className="essentials-document-actions">
                <a
                  className="essentials-inline-link"
                  href={noticeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir edital <ArrowUpRight size={15} />
                </a>
                <Button
                  icon={Trash2}
                  disabled={disabled || uploading}
                  onClick={() => onChange({ noticeUrl: "" })}
                >
                  Remover
                </Button>
              </div>
            </div>
          )}
          <div className="essentials-upload-row">
            <input
              ref={uploadRef}
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Enviar edital em PDF"
              tabIndex={-1}
              disabled={disabled || uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setUploadName(file.name);
                try {
                  await onUploadNotice(file);
                } finally {
                  setUploadName("");
                }
              }}
            />
            <Button
              icon={Upload}
              onClick={() => uploadRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading
                ? "Enviando PDF…"
                : noticeLink
                  ? "Substituir PDF"
                  : "Enviar PDF"}
            </Button>
            <p role="status">
              {uploading
                ? `Enviando ${uploadName || "o edital"}. Aguarde para publicar.`
                : "O envio preenche o link. Publique para atualizar o edital no site."}
            </p>
          </div>
        </fieldset>
      </section>

      <section className="essentials-card">
        <header className="essentials-section-heading essentials-schedule-heading">
          <span className="essentials-heading-icon">
            <FileText size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h2>Cronograma</h2>
            <p>Organize as etapas na ordem em que devem aparecer no site.</p>
          </div>
          <span className="essentials-stage-count">
            {stages.length} {stages.length === 1 ? "etapa" : "etapas"}
          </span>
        </header>
        <fieldset disabled={disabled} className="essentials-schedule-body">
          {stages.length > 0 && (
            <p className="field-hint essentials-stage-hint">
              O nome de cada etapa é obrigatório. Datas e orientações são
              opcionais.
            </p>
          )}
          {stages.length === 0 && (
            <div className="essentials-empty-schedule">
              <CalendarDays size={22} strokeWidth={1.5} />
              <div>
                <h3>Nenhuma etapa cadastrada</h3>
                <p>
                  {selection.scheduleImage
                    ? "O cronograma atual permanece no site. Ao publicar as etapas, ele será substituído."
                    : "Adicione as datas e orientações da próxima seleção."}
                </p>
              </div>
            </div>
          )}
          <div className="essentials-stage-list" ref={stageListRef}>
            {stages.map((stage, index) => (
              <div
                className="essentials-stage"
                key={stage.id}
                data-stage-id={stage.id}
              >
                <div className="essentials-stage-heading">
                  <h3>
                    <span>{String(index + 1).padStart(2, "0")}</span>Etapa{" "}
                    {index + 1}
                  </h3>
                  <div className="essentials-stage-actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`Mover etapa ${index + 1} para cima`}
                      title="Mover para cima"
                      onClick={() => moveStage(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === stages.length - 1}
                      aria-label={`Mover etapa ${index + 1} para baixo`}
                      title="Mover para baixo"
                      onClick={() => moveStage(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button essentials-remove-stage"
                      aria-label={`Remover etapa ${index + 1}`}
                      title="Remover etapa"
                      onClick={() => removeStage(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="essentials-stage-fields">
                  <div className="essentials-field-row essentials-stage-main-fields">
                    <Field
                      label={`Nome da etapa ${index + 1}`}
                      value={stage.title}
                      onChange={(title) => updateStage(index, { title })}
                      placeholder="Ex.: Entrevistas"
                      maxLength={240}
                      required
                      data-field={`selection.stages.${index}.title`}
                      error={errorFor(`stages.${index}.title`)}
                    />
                    <Field
                      label={`Data da etapa ${index + 1}`}
                      type="date"
                      value={stage.date}
                      onChange={(date) => updateStage(index, { date })}
                      data-field={`selection.stages.${index}.date`}
                      error={errorFor(`stages.${index}.date`)}
                    />
                  </div>
                  <details
                    className="essentials-stage-details"
                    open={
                      stages.length <= 3 ||
                      Boolean(stage.description) ||
                      Boolean(errorFor(`stages.${index}.description`))
                    }
                  >
                    <summary>Orientações opcionais</summary>
                    <Field
                      label={`Orientações da etapa ${index + 1}`}
                      multiline
                      value={stage.description}
                      onChange={(description) =>
                        updateStage(index, { description })
                      }
                      placeholder="Local, horário ou outras orientações. Opcional."
                      maxLength={2000}
                      data-field={`selection.stages.${index}.description`}
                      error={errorFor(`stages.${index}.description`)}
                    />
                  </details>
                </div>
              </div>
            ))}
          </div>
          {removedStage && (
            <div className="essentials-undo" role="status">
              <p>
                Etapa “{removedStage.stage.title || "Sem nome"}” removida do
                rascunho.
              </p>
              <Button
                icon={RotateCcw}
                onClick={undoRemoveStage}
                disabled={disabled || stages.length >= 30}
              >
                Desfazer
              </Button>
            </div>
          )}
          <Button
            ref={addStageRef}
            className="essentials-add-stage"
            icon={Plus}
            onClick={addStage}
            disabled={disabled || stages.length >= 30}
          >
            Adicionar etapa
          </Button>
          {stages.length > 0 && selection.scheduleImage && (
            <p className="field-hint">
              Ao publicar as etapas, o cronograma atual será substituído.
            </p>
          )}
          {stages.length >= 30 && (
            <p className="field-hint">O cronograma pode ter até 30 etapas.</p>
          )}
        </fieldset>
      </section>
    </div>
  );
}

export function ContactEditor({ site, onChange, disabled, errors = {} }) {
  const initialProfile = () => site.instagramHandle || site.instagramUrl || "";
  const [profileInput, setProfileInput] = useState(initialProfile);
  const ownUpdateRef = useRef(null);
  useEffect(() => {
    const next = `${site.instagramHandle}\n${site.instagramUrl}`;
    if (ownUpdateRef.current === next) return;
    setProfileInput(site.instagramHandle || site.instagramUrl || "");
  }, [site.instagramHandle, site.instagramUrl]);
  const parsedProfile = instagramProfile(profileInput);
  const profileError =
    fieldError(errors, "site.instagramUrl") ||
    fieldError(errors, "site.instagramHandle") ||
    (!parsedProfile &&
      "Informe o @nome de usuário ou o link do perfil oficial no Instagram.");
  const emailLink =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.email || "") &&
    !/[\r\n]/.test(site.email)
      ? `mailto:${site.email}`
      : null;
  const profileLink = parsedProfile?.url || null;
  function updateProfile(value) {
    setProfileInput(value);
    const profile = instagramProfile(value);
    const patch = profile
      ? { instagramHandle: profile.handle, instagramUrl: profile.url }
      : { instagramHandle: "", instagramUrl: value };
    ownUpdateRef.current = `${patch.instagramHandle}\n${patch.instagramUrl}`;
    onChange(patch);
  }
  return (
    <div className="essentials-contact-layout">
      <section className="essentials-card">
        <header className="essentials-section-heading">
          <span className="essentials-heading-icon">
            <Mail size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h2>Canais de contato</h2>
            <p>Como estudantes, parceiros e a comunidade encontram o Nexo.</p>
          </div>
        </header>
        <fieldset className="essentials-form" disabled={disabled}>
          <Field
            label="E-mail de contato"
            type="email"
            value={site.email}
            onChange={(email) => onChange({ email })}
            placeholder="contato@exemplo.com.br"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            hint="Endereço exibido na área de contato do site."
            data-field="site.email"
            error={fieldError(errors, "site.email")}
          />
          <div className="essentials-form-divider" />
          <Field
            label="Perfil do Instagram"
            value={profileInput}
            onChange={updateProfile}
            placeholder="@nexogovernamental"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
            hint="Digite o @nome de usuário ou cole o link do perfil. O endereço e o nome exibidos no site são atualizados juntos."
            data-field="site.instagramUrl"
            error={profileError}
          />
        </fieldset>
      </section>
      <aside className="essentials-contact-aside">
        <h2>Confira os canais</h2>
        <p>Abra os links para confirmar se levam à equipe do Nexo.</p>
        <div className="essentials-contact-preview">
          <div>
            <Mail size={17} />
            {emailLink ? (
              <a href={emailLink}>
                {site.email}
                <ArrowUpRight size={15} />
              </a>
            ) : (
              <span>{site.email || "E-mail a definir"}</span>
            )}
          </div>
          <div>
            <AtSign size={17} />
            {profileLink ? (
              <a href={profileLink} target="_blank" rel="noopener noreferrer">
                {parsedProfile.handle}
                <ArrowUpRight size={15} />
              </a>
            ) : (
              <span>Perfil a definir</span>
            )}
          </div>
        </div>
        <p className="essentials-contact-footnote">
          As alterações aparecem no site depois de publicar.
        </p>
      </aside>
    </div>
  );
}
