import "../css/blog-teaser.css";

const outlet = document.getElementById("journal-latest");
if (outlet) {
  fetch("/api/blog", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!Array.isArray(data?.posts) || !data.posts.length) return;
      const fragment = document.createDocumentFragment();
      for (const post of data.posts.slice(0, 2)) {
        const link = document.createElement("a");
        link.className = "journal-story";
        link.href = `/blog/${encodeURIComponent(post.slug)}`;
        const category = document.createElement("span");
        category.className = "journal-category";
        category.textContent = post.category;
        const title = document.createElement("h3");
        title.textContent = post.title;
        const summary = document.createElement("p");
        summary.textContent = post.excerpt;
        const reading = document.createElement("span");
        reading.className = "journal-reading";
        reading.textContent = `${post.readingMinutes} min de leitura · Ler artigo ↗`;
        link.append(category, title, summary, reading);
        fragment.append(link);
      }
      outlet.replaceChildren(fragment);
    })
    .catch(() => {
      /* The permanent blog link stays usable if the API is unavailable. */
    });
}
