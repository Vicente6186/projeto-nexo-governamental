const FIELDS = [
  ["site.email", "E-mail de contato"],
  ["site.instagramUrl", "Perfil do Instagram"],
  ["site.instagramHandle", "Nome no Instagram"],
  ["selection.edition", "Edição do processo"],
  ["selection.status", "Situação das inscrições"],
  ["selection.opensAt", "Abertura das inscrições"],
  ["selection.closesAt", "Encerramento das inscrições"],
  ["selection.applicationUrl", "Formulário de inscrição"],
  ["selection.noticeUrl", "Edital"],
  ["selection.stages", "Etapas do cronograma"],
];
const get = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function display(value, path) {
  if (Array.isArray(value))
    return (
      value
        .map(
          (stage, index) =>
            `${index + 1}. ${stage.title || "Etapa sem nome"}${stage.date ? ` · ${stage.date}` : ""}${stage.description ? ` — ${stage.description}` : ""}`,
        )
        .join("\n") || "Sem etapas"
    );
  if (path === "selection.status")
    return (
      {
        open: "Inscrições abertas / programadas",
        upcoming: "Em breve",
        closed: "Encerrado",
      }[value] || value
    );
  return value || "Não informado";
}
function changes(current, previous) {
  return FIELDS.filter(
    ([path]) => !same(get(current, path), get(previous, path)),
  ).map(([path, label]) => ({
    path,
    label,
    before: display(get(previous, path), path),
    after: display(get(current, path), path),
  }));
}
function editableCopy(base, incoming) {
  const result = structuredClone(base);
  for (const [path] of FIELDS) {
    const [group, key] = path.split(".");
    if (incoming?.[group] && Object.hasOwn(incoming[group], key)) {
      const value = incoming[group][key];
      if (path === "selection.stages") {
        if (
          !Array.isArray(value) ||
          value.some(
            (stage) =>
              !stage ||
              ["id", "title", "date", "description"].some(
                (field) => typeof stage[field] !== "string",
              ),
          )
        )
          throw new Error("Cronograma inválido na cópia local.");
      } else if (typeof value !== "string")
        throw new Error("Campo inválido na cópia local.");
      result[group][key] = structuredClone(value);
    }
  }
  return result;
}
function mergeDraft(base, local, remote, choices = {}) {
  const result = structuredClone(remote),
    conflicts = [];
  for (const [path, label] of FIELDS) {
    const before = get(base, path),
      mine = get(local, path),
      theirs = get(remote, path);
    if (same(before, mine)) continue;
    const conflict = !same(theirs, before) && !same(mine, theirs);
    if (conflict)
      conflicts.push({
        path,
        label,
        mine: display(mine, path),
        theirs: display(theirs, path),
      });
    if (conflict && choices[path] !== "mine") continue;
    const [group, key] = path.split(".");
    result[group][key] = structuredClone(mine);
  }
  return { result, conflicts };
}
function validateSite(content, { publishing = false } = {}) {
  const errors = {};
  const s = content.selection,
    site = content.site;
  if (site.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.email))
    errors["site.email"] =
      "Informe um e-mail válido, como contato@exemplo.com.br.";
  if (site.instagramUrl || site.instagramHandle) {
    let profile;
    try {
      const u = new URL(site.instagramUrl);
      if (
        u.protocol === "https:" &&
        ["instagram.com", "www.instagram.com"].includes(u.hostname) &&
        !u.username &&
        !u.password &&
        !u.port
      )
        profile = u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)?.[1];
    } catch {}
    if (
      !profile ||
      site.instagramHandle.replace(/^@/, "").toLowerCase() !==
        profile.toLowerCase()
    )
      errors["site.instagramUrl"] =
        "Informe o @usuário ou o endereço completo do perfil oficial do Instagram.";
  }
  for (const key of ["applicationUrl", "noticeUrl"]) {
    const value = s[key];
    if (!value) continue;
    try {
      if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) {
        if (key === "applicationUrl") throw new Error();
      } else {
        const url = new URL(value);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error();
      }
    } catch {
      errors[`selection.${key}`] =
        key === "noticeUrl"
          ? "Use o link completo do edital ou envie um PDF."
          : "Informe o endereço completo do formulário, começando por https://.";
    }
  }
  if (s.opensAt && s.closesAt && s.closesAt < s.opensAt)
    errors["selection.closesAt"] =
      "O encerramento deve ocorrer na mesma data ou depois da abertura.";
  if (publishing && s.status === "open" && !s.applicationUrl)
    errors["selection.applicationUrl"] =
      "Adicione o formulário antes de abrir ou programar as inscrições.";
  if (publishing)
    s.stages.forEach((stage, index) => {
      if (!stage.title.trim())
        errors[`selection.stages.${index}.title`] =
          "Informe o nome desta etapa.";
    });
  return errors;
}
module.exports = { changes, editableCopy, mergeDraft, validateSite };
