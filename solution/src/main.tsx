import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "./auth/Auth0Provider";
import App from "./App";
import "./styles/index.css";
import "./styles/lab-guide.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Auth0Provider>
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
