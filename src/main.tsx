import "./global.css";
import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import { App } from "./App";
import { HashRouter } from "react-router-dom";

history.scrollRestoration = "manual";
if (!location.hash)
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${location.search}#/`,
  );
createRoot(document.getElementById("root")!).render(
  <Theme
    appearance="dark"
    accentColor="gray"
    grayColor="slate"
    radius="medium"
    panelBackground="solid"
  >
    <HashRouter>
      <App />
    </HashRouter>
  </Theme>,
);
