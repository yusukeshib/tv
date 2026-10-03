import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HashRouter } from "react-router-dom";
import "./global.css";

history.scrollRestoration = "manual";
if (!location.hash)
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${location.search}#/`,
  );
createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
