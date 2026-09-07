const path = require("node:path");
const { statSync, realpathSync } = require("node:fs");
const { ValidationError } = require("./validation.cjs");

function createAssetValidator(db, { dataDir, distDir, origins }) {
  const isFileWithin = (root, target) => {
    try {
      const resolved = realpathSync(target);
      return (
        resolved.startsWith(`${realpathSync(root)}${path.sep}`) &&
        statSync(resolved).isFile()
      );
    } catch {
      return false;
    }
  };
  const validate = (url, { kind = "image", field = "file" } = {}) => {
    if (!url) return;
    if (url.startsWith("/uploads/")) {
      if (kind === "external")
        throw new ValidationError(
          "Use o endereço HTTP ou HTTPS do formulário de inscrição.",
          field,
          "ASSET_TYPE_MISMATCH",
        );
      const asset = db.prepare("SELECT * FROM assets WHERE url = ?").get(url);
      if (
        !asset ||
        !isFileWithin(
          path.join(dataDir, "uploads"),
          path.join(dataDir, "uploads", path.basename(url)),
        )
      )
        throw new ValidationError(
          "Este arquivo não está mais disponível. Envie ou selecione o arquivo novamente.",
          field,
          "ASSET_NOT_FOUND",
        );
      if (
        (kind === "pdf" && asset.type !== "application/pdf") ||
        (kind === "image" &&
          !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(
            asset.type,
          ))
      )
        throw new ValidationError(
          kind === "pdf"
            ? "Selecione um documento PDF para o edital."
            : "Selecione uma imagem válida.",
          field,
          "ASSET_TYPE_MISMATCH",
        );
      return;
    }
    if (/^\/?assets\//.test(url)) {
      const normalized = url.replace(/^\//, "");
      if (
        kind !== "image" ||
        /(?:^|\/)\.\.(?:\/|$)|%|\\/.test(url) ||
        !/\.(png|jpe?g|webp|avif)$/i.test(url) ||
        !isFileWithin(distDir, path.join(distDir, normalized))
      )
        throw new ValidationError(
          "Esta imagem não está disponível. Escolha outra imagem da biblioteca.",
          field,
          "ASSET_NOT_FOUND",
        );
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError(
        "Informe um endereço HTTP ou HTTPS válido.",
        field,
        "INVALID_URL",
      );
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new ValidationError(
        "Informe um endereço HTTP ou HTTPS válido.",
        field,
        "INVALID_URL",
      );
    // An absolute URL for this site must pass the same checks as a relative upload.
    // External URLs are never fetched by the server.
    if (
      origins?.has(parsed.origin) &&
      /^\/(uploads|assets)\//.test(parsed.pathname)
    ) {
      if (parsed.search || parsed.hash)
        throw new ValidationError(
          "Selecione o arquivo pelo painel.",
          field,
          "INVALID_URL",
        );
      validate(parsed.pathname, { kind, field });
    }
  };
  return validate;
}

async function prepareImage(buffer) {
  const sharp = require("sharp");
  try {
    const input = sharp(buffer, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const metadata = await input.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 16000 ||
      metadata.height > 16000 ||
      (metadata.pages || 1) > 1
    )
      throw new Error("Image dimensions or pages exceeded");
    const result = await input
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
      type: "image/webp",
      extension: "webp",
    };
  } catch {
    throw new ValidationError(
      "Não foi possível abrir esta imagem. Envie um PNG, JPEG, WebP ou AVIF válido, com até 40 megapixels e 16.000 pixels por lado.",
      "file",
      "INVALID_IMAGE",
    );
  }
}

function migrateAssets(db) {
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(assets)")
      .all()
      .map((column) => column.name),
  );
  for (const [name, type] of [
    ["width", "INTEGER"],
    ["height", "INTEGER"],
    ["original_path", "TEXT"],
  ])
    if (!columns.has(name))
      db.exec(`ALTER TABLE assets ADD COLUMN ${name} ${type}`);
}
module.exports = { createAssetValidator, prepareImage, migrateAssets };
