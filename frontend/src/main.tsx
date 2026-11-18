import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/theme.css";
import "./styles/global.css";
import { App } from "./App";
import { USE_MOCKS } from "./api/config";
import { wakeServer } from "./api/http";

// The free server sleeps when idle: start waking it now, while the person reads the home screen.
if (!USE_MOCKS) wakeServer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
