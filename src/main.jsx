import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx";
// Self-hosted so the Content-Security-Policy can stay at `font-src 'self'`,
// and so the typeface still renders on a bad connection.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./styles/tokens.css";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Registered after render so a service-worker failure can never stop the app
// from loading. Caching is limited to the shell; see public/service-worker.js.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Offline support is an enhancement, not a requirement.
    });
  });
}
