import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "../css/blog-teaser.css";

const outlet = document.getElementById("journal-latest");
if (outlet) {
  fetch("/api/blog", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!Array.isArray(data?.posts) || !data.posts.length) return;
      const fragment = document.createDocumentFragment();
      const label = document.createElement("span");
      label.className = "journal-latest-label";
      label.textContent = "Últimas publicações";
      fragment.append(label);
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
        reading.textContent = `${post.readingMinutes} min de leitura`;
        const arrow = document.createElement("span");
        arrow.className = "journal-story-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        reading.append(arrow);
        link.append(category, title, summary, reading);
        fragment.append(link);
      }
      outlet.replaceChildren(fragment);
    })
    .catch(() => {
      /* The permanent blog link stays usable if the API is unavailable. */
    });
}
