import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/app.css";
import { App } from "./app/App";
import { ThemeProvider } from "./app/ThemeProvider";
import { PreferencesProvider } from "./app/PreferencesProvider";

setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <PreferencesProvider>
          <App />
        </PreferencesProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
);
