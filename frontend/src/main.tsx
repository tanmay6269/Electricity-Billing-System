import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "Inter, system-ui, sans-serif" } }} />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
