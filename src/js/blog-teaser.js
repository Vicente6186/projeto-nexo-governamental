import "../css/blog-teaser.css";
import { loadLatestPosts } from "./blog-teaser-view.cjs";

const outlet = document.getElementById("journal-latest");
if (outlet) loadLatestPosts(outlet, window.fetch.bind(window));
