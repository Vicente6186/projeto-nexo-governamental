const { createHash } = require("node:crypto");

const BRAND = "Nexo Governamental XI de Agosto";
const jsonLd = (value) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

function articleSchema(post, origin) {
  const url = new URL(`/blog/${encodeURIComponent(post.slug)}`, origin).href;
  const publisher = {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: BRAND,
    url: `${origin}/`,
  };
  const authorName = post.author || BRAND;
  const author = {
    "@type": /^(?:equipe\b|nexo governamental\b)/i.test(authorName)
      ? "Organization"
      : "Person",
    name: authorName,
  };
  const categoryUrl = new URL(
    `/blog/?${new URLSearchParams({ category: post.category })}`,
    origin,
  ).href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        headline: post.title,
        description: post.excerpt,
        inLanguage: "pt-BR",
        author,
        publisher,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt || post.publishedAt,
        articleSection: post.category,
        ...(post.tags?.length ? { keywords: post.tags } : {}),
        ...(post.coverImage
          ? {
              image: {
                "@type": "ImageObject",
                url: new URL(post.coverImage, origin).href,
                caption: post.coverAlt,
                ...(post.coverCredit ? { creditText: post.coverCredit } : {}),
                ...(post.coverMedia
                  ? {
                      width: post.coverMedia.width,
                      height: post.coverMedia.height,
                    }
                  : {}),
              },
            }
          : {}),
        isAccessibleForFree: true,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Blog",
            item: `${origin}/blog/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: post.category,
            item: categoryUrl,
          },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };
}

function htmlCsp(payload) {
  const scripts =
    typeof payload === "string"
      ? [
          ...payload.matchAll(
            /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
          ),
        ]
      : [];
  const hashes = scripts.map(
    (match) =>
      `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
  );
  return `default-src 'self'; script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'self'`;
}

module.exports = { articleSchema, jsonLd, htmlCsp };
