import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "./api";
import { Button, Field, Loading, Modal } from "./components";
import "./categories.css";

export default function CategoryManager({
  onChange,
  onClose,
  onSessionExpired,
  closing,
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [replacementId, setReplacementId] = useState("");
  const operation = useRef(false);
  const mounted = useRef(true);
  const loadController = useRef(null);
  const focusRef = useRef(null);
  const locked = busy || closing;

  async function load() {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/admin/blog-categories", {
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      setCategories(result.categories);
      onChange(result);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(cause.message);
      if (cause.status === 401) onSessionExpired?.();
    } finally {
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      loadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!loading) focusRef.current?.focus();
  }, [editing, loading]);

  function edit(item, type) {
    setError("");
    setMessage("");
    setEditing({ ...item, type });
    setName(type === "rename" ? item.name : "");
    setReplacementId("");
  }
  function back() {
    setEditing(null);
    setName("");
    setError("");
  }
  async function submit(event) {
    event.preventDefault();
    if (operation.current || closing) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const deleting = editing?.type === "delete";
      const result = await api(
        `/api/admin/blog-categories${editing ? `/${editing.id}` : ""}`,
        {
          method: deleting ? "DELETE" : editing ? "PUT" : "POST",
          body: deleting
            ? { version: editing.version, replacementId: replacementId || null }
            : { name, ...(editing ? { version: editing.version } : {}) },
        },
      );
      if (!mounted.current) return;
      setCategories(result.categories);
      onChange(result);
      setMessage(
        deleting
          ? "Categoria excluída. Artigos preservados."
          : editing
            ? "Categoria renomeada."
            : "Categoria criada.",
      );
      setEditing(null);
      setName("");
      focusRef.current?.focus();
    } catch (cause) {
      setError(cause.message);
      if (cause.status === 401) onSessionExpired?.();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Categorias"
      onClose={() => {
        if (!locked) onClose();
      }}
    >
      <div className="category-manager" aria-busy={locked || loading}>
        {error && (
          <div className="category-feedback" role="alert">
            <p>{error}</p>
            <Button
              disabled={locked}
              onClick={() => {
                back();
                load();
              }}
            >
              Atualizar lista
            </Button>
          </div>
        )}
        {message && (
          <p className="category-success" role="status">
            {message}
          </p>
        )}
        {loading ? (
          <Loading compact label="Carregando categorias…" />
        ) : (
          <>
            {editing && (
              <Button icon={ArrowLeft} onClick={back} disabled={locked}>
                Voltar às categorias
              </Button>
            )}
            <form className="category-form" onSubmit={submit}>
              <fieldset disabled={locked}>
                {editing?.type === "delete" ? (
                  <>
                    <h3>Excluir “{editing.name}”?</h3>
                    <p className="field-hint">Os artigos serão preservados.</p>
                    {editing.publishedCount > 0 && (
                      <p className="field-hint">
                        A categoria também será alterada nos artigos publicados.
                      </p>
                    )}
                    {editing.articleCount > 0 && (
                      <div className="field">
                        <label htmlFor="category-replacement">
                          Mover artigos para
                        </label>
                        <select
                          ref={focusRef}
                          id="category-replacement"
                          value={replacementId}
                          onChange={(event) =>
                            setReplacementId(event.target.value)
                          }
                          required
                        >
                          <option value="">Escolha uma categoria</option>
                          {categories
                            .filter((item) => item.id !== editing.id)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                        <p className="field-hint">
                          {editing.articleCount}{" "}
                          {editing.articleCount === 1
                            ? "artigo vinculado"
                            : "artigos vinculados"}
                          , incluindo rascunhos e arquivados.
                        </p>
                      </div>
                    )}
                    <Button
                      ref={editing.articleCount ? undefined : focusRef}
                      type="submit"
                      variant="danger"
                      icon={busy ? LoaderCircle : Trash2}
                      disabled={
                        locked || (editing.articleCount > 0 && !replacementId)
                      }
                    >
                      Excluir categoria
                    </Button>
                  </>
                ) : (
                  <>
                    <Field
                      label={editing ? "Nome da categoria" : "Nova categoria"}
                      ref={focusRef}
                      value={name}
                      onChange={setName}
                      maxLength={80}
                      required
                      placeholder="Ex.: Projetos e iniciativas"
                    />
                    {editing?.publishedCount > 0 && (
                      <p className="field-hint">
                        O novo nome também aparecerá nos artigos publicados.
                      </p>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      icon={busy ? LoaderCircle : editing ? Pencil : Plus}
                      disabled={locked || !name.trim()}
                    >
                      {editing ? "Salvar nome" : "Criar categoria"}
                    </Button>
                  </>
                )}
              </fieldset>
            </form>
            {!editing && (
              <ul className="category-list" aria-label="Categorias do blog">
                {categories.map((item) => (
                  <li key={item.id}>
                    <div className="category-info">
                      <strong>{item.name}</strong>
                      <span>
                        {item.articleCount}{" "}
                        {item.articleCount === 1 ? "artigo" : "artigos"}
                      </span>
                    </div>
                    <div className="category-actions">
                      <Button
                        icon={Pencil}
                        aria-label={`Renomear ${item.name}`}
                        title="Renomear"
                        disabled={locked}
                        onClick={() => edit(item, "rename")}
                      />
                      <Button
                        icon={Trash2}
                        aria-label={`Excluir ${item.name}`}
                        title={
                          categories.length === 1
                            ? "Mantenha pelo menos uma categoria"
                            : "Excluir"
                        }
                        disabled={locked || categories.length === 1}
                        onClick={() => edit(item, "delete")}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="category-footer">
          <Button onClick={onClose} disabled={locked}>
            {closing ? "Atualizando artigo…" : "Concluir"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
