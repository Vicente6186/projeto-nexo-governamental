import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/instrument-serif/latin-400.css";
import "../css/blog-teaser.css";
import { loadLatestPosts } from "./blog-teaser-view.cjs";

const outlet = document.getElementById("journal-latest");
if (outlet) loadLatestPosts(outlet, window.fetch.bind(window));
