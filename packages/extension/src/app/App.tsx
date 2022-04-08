import { RecoilRoot } from "recoil";
import { NotificationsProvider } from "../context/Notifications";
import { WithTheme } from "./theme";
import { Router } from "./Router";
import "./App.css";
import "@fontsource/inter";

export default function App() {
  return (
    <RecoilRoot>
      <_App />
    </RecoilRoot>
  );
}

function _App() {
  return (
    <NotificationsProvider>
      <WithTheme>
        <Router />
      </WithTheme>
    </NotificationsProvider>
  );
}