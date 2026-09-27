import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Toaster } from "sonner";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-right" richColors />
  </React.StrictMode>,
);
