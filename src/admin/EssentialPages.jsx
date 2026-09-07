import React, { useEffect, useId, useRef } from "react";
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
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  dateLabel,
  dayLabel,
  effectiveStatus,
} from "./components";
import "./essentials.css";

const STATUS_OPTIONS = [
  {
    value: "upcoming",
    label: "Em breve",
    description: "Prepare a próxima edição.",
    Icon: Clock3,
  },
  {
    value: "open",
    label: "Inscrições abertas",
    description: "Receba novas inscrições.",
    Icon: CheckCircle2,
  },
  {
    value: "closed",
    label: "Encerrado",
    description: "Finalize este processo.",
    Icon: LockKeyhole,
  },
];

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
  const selection = content.selection;
  const status = effectiveStatus(selection);
  const hasChanges = dirty || pending;
  return (
    <div className="essentials-overview">
      <section className="essentials-welcome">
        <div>
          <span className="essentials-eyebrow">Seu espaço de gestão</span>
          <h2>O Nexo, sempre em dia.</h2>
          <p>
            Seleção, publicações e contato. O essencial para cuidar da presença
            do Nexo.
          </p>
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
            <h2>Processo seletivo</h2>
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
              <dd>{dayLabel(selection.opensAt)}</dd>
            </div>
            <div>
              <dt>Encerramento</dt>
              <dd>{dayLabel(selection.closesAt)}</dd>
            </div>
          </dl>
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
                : "Tudo atualizado"}
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
}) {
  const statusName = useId();
  const uploadRef = useRef(null);
  const stageListRef = useRef(null);
  const addStageRef = useRef(null);
  const focusStageRef = useRef(null);
  const stages = selection.stages || [];
  const status = effectiveStatus(selection);

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
    focusStageRef.current =
      stages[index + 1]?.id || stages[index - 1]?.id || "add";
    onChange({ stages: stages.filter((_, i) => i !== index) });
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
          </fieldset>

          <Field
            label="Edição do processo"
            value={selection.edition}
            onChange={(edition) => onChange({ edition })}
            placeholder="Ex.: Processo seletivo 2026.2"
            maxLength={100}
          />
          <div className="essentials-field-row">
            <Field
              label="Abertura das inscrições"
              type="date"
              value={selection.opensAt}
              onChange={(opensAt) => onChange({ opensAt })}
            />
            <Field
              label="Encerramento das inscrições"
              type="date"
              value={selection.closesAt}
              onChange={(closesAt) => onChange({ closesAt })}
              min={selection.opensAt || undefined}
            />
          </div>
          <div className="essentials-status-note">
            <Clock3 size={15} />
            <p>
              As datas também controlam o período de inscrição. Com os dados
              atuais:{" "}
              <strong>{status.label.toLocaleLowerCase("pt-BR")}.</strong>
            </p>
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
          />
          <Field
            label="Link do edital"
            value={selection.noticeUrl}
            onChange={(noticeUrl) => onChange({ noticeUrl })}
            placeholder="Cole o link do documento ou envie um PDF"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
          />
          <div className="essentials-upload-row">
            <input
              ref={uploadRef}
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Enviar edital em PDF"
              tabIndex={-1}
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUploadNotice(file);
              }}
            />
            <Button
              icon={Upload}
              onClick={() => uploadRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? "Enviando PDF…" : "Enviar PDF"}
            </Button>
            <p>PDF de até 8 MB. O envio preenche o link do edital.</p>
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
                    />
                    <Field
                      label={`Data da etapa ${index + 1}`}
                      type="date"
                      value={stage.date}
                      onChange={(date) => updateStage(index, { date })}
                    />
                  </div>
                  <Field
                    label={`Orientações da etapa ${index + 1}`}
                    multiline
                    value={stage.description}
                    onChange={(description) =>
                      updateStage(index, { description })
                    }
                    placeholder="Local, horário ou outras orientações. Opcional."
                    maxLength={2000}
                  />
                </div>
              </div>
            ))}
          </div>
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

export function ContactEditor({ site, onChange, disabled }) {
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
          />
          <div className="essentials-form-divider" />
          <Field
            label="Perfil do Instagram"
            value={site.instagramUrl}
            onChange={(instagramUrl) => onChange({ instagramUrl })}
            placeholder="https://www.instagram.com/nexogovernamental/"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
            hint="Cole o link completo do perfil oficial."
          />
          <Field
            label="Nome de usuário no Instagram"
            value={site.instagramHandle}
            onChange={(instagramHandle) => onChange({ instagramHandle })}
            placeholder="@nexogovernamental"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
            hint="Este é o nome que aparece nos links para o Instagram."
          />
        </fieldset>
      </section>
      <aside className="essentials-contact-aside">
        <span className="essentials-eyebrow">Um canal aberto</span>
        <h2>Conexões começam por aqui.</h2>
        <p>
          Use os canais oficiais e mantenha os dados atualizados para facilitar
          o contato com a equipe.
        </p>
        <div className="essentials-contact-preview">
          <div>
            <Mail size={17} />
            <span>{site.email || "E-mail a definir"}</span>
          </div>
          <div>
            <AtSign size={17} />
            <span>{site.instagramHandle || "Perfil a definir"}</span>
          </div>
        </div>
        <p className="essentials-contact-footnote">
          Salve suas alterações e publique quando estiver tudo certo.
        </p>
      </aside>
    </div>
  );
}
