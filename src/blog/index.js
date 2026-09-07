import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles.css";

// Reading, navigation, filters and pagination also work without JavaScript.
document.documentElement.classList.add("has-js");
const menu = document.querySelector(".blog-navigation");
const menuButton = document.querySelector("[data-menu-toggle]");
if (menu && menuButton) {
  const closeMenu = () => {
    menuButton.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  };
  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !menuButton.contains(event.target))
      closeMenu();
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
}

const shareButton = document.querySelector("[data-copy-link]");
if (shareButton) {
  shareButton.hidden = false;
  const status = document.querySelector("[data-share-status]");
  const fallback = document.querySelector("[data-share-fallback]");
  shareButton.addEventListener("click", async () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = canonical || location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = "Link copiado. Pronto para compartilhar.";
      shareButton.classList.add("is-copied");
      window.setTimeout(() => shareButton.classList.remove("is-copied"), 2500);
    } catch {
      // A selectable link keeps sharing useful in browsers without clipboard access.
      fallback.hidden = false;
      fallback.value = url;
      fallback.focus();
      fallback.select();
      status.textContent = "Selecione e copie o link abaixo.";
    }
  });
}

const progress = document.querySelector("[data-reading-progress]");
const article = document.querySelector(".article-body");
if (progress && article) {
  let scheduled = false;
  const update = () => {
    const bounds = article.getBoundingClientRect();
    const length = bounds.height - Math.min(window.innerHeight * 0.55, 400);
    const ratio = Math.max(
      0,
      Math.min(1, (100 - bounds.top) / Math.max(length, 1)),
    );
    progress.value = ratio;
    scheduled = false;
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();
}
