import React from "react";
import { createRoot } from "react-dom/client";
import Forge from "./forge/Forge.jsx";
import "./forge/styles/tokens.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Forge />
  </React.StrictMode>,
);
