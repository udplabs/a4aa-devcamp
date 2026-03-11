import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// =============================================================
// LAB 1: Wrap <App /> with Auth0Provider
// See: lab-guide/01-user-authentication.md - Step 6
// =============================================================

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
