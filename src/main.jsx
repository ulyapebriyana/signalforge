import React from "react";
import { createRoot } from "react-dom/client";

// SignalForge ships two frontends against the same API.
//   /classic/*  → the original interface, loaded untouched from ./App.jsx
//   everything else → the Forge interface in ./forge
// The split happens here, before either bundle is fetched, so the two stylesheets
// never share a document.
const root = createRoot(document.getElementById("root"));
const isClassic = window.location.pathname.startsWith("/classic");

const [{ default: Root }] = isClassic
  ? await Promise.all([import("./App.jsx"), import("./styles.css")])
  : await Promise.all([import("./forge/Forge.jsx"), import("./forge/styles/tokens.css")]);

root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
