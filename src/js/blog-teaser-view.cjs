const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

function coverUrl(value, origin) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function postCard(document, post) {
  const link = document.createElement("a");
  link.className = "journal-story";
  link.href = `/blog/${encodeURIComponent(post.slug)}`;

  const cover = document.createElement("span");
  cover.className = "journal-cover";
  const monogram = document.createElement("span");
  monogram.className = "journal-monogram";
  monogram.textContent = "N.";
  monogram.setAttribute("aria-hidden", "true");
  cover.append(monogram);

  const imageUrl = coverUrl(post.coverImage, document.baseURI);
  if (imageUrl) {
    const image = document.createElement("img");
    // The title names this single article link; avoid a repeated cover label.
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener(
      "load",
      () => {
        monogram.hidden = true;
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        image.remove();
        monogram.hidden = false;
      },
      { once: true },
    );
    image.src = imageUrl;
    cover.append(image);
  }

  const title = document.createElement("h3");
  title.textContent = post.title;
  link.append(cover, title);

  const publishedAt = new Date(post.publishedAt);
  if (post.publishedAt && Number.isFinite(publishedAt.getTime())) {
    const date = document.createElement("time");
    date.className = "journal-date";
    date.dateTime = publishedAt.toISOString();
    date.textContent = dateFormatter.format(publishedAt);
    link.append(date);
  }
  return link;
}

async function loadLatestPosts(outlet, fetchPosts) {
  const message = outlet.querySelector("[data-journal-message]");
  const setMessage = (text) => {
    if (message) message.textContent = text;
  };
  setMessage("Carregando publicações…");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchPosts("/api/blog?sort=latest", {
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Publications unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.posts)) throw new Error("Invalid publications");
    if (!data.posts.length) {
      setMessage("Novas publicações em breve.");
      return;
    }
    const posts = data.posts
      .filter(
        (post) =>
          post &&
          typeof post.slug === "string" &&
          post.slug.trim() &&
          typeof post.title === "string" &&
          post.title.trim(),
      )
      .slice(0, 2);
    if (!posts.length) throw new Error("Invalid publications");
    const document = outlet.ownerDocument;
    outlet.replaceChildren(...posts.map((post) => postCard(document, post)));
  } catch {
    setMessage("Acesse o blog para acompanhar.");
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { loadLatestPosts };
