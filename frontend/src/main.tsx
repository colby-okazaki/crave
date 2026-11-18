import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/theme.css";
import "./styles/global.css";
import { App } from "./App";
import { loadApi } from "./api";
import { USE_MOCKS } from "./api/config";
import { wakeServer } from "./api/http";

// The free server sleeps when idle: start waking it now, while the person reads the home screen.
if (!USE_MOCKS) wakeServer();

// Fake-data mode loads its own code first; with the real server this resolves right away.
void loadApi().then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
