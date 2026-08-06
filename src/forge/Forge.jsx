import { Suspense, lazy } from "react";
import { usePath } from "./lib/router.js";

const Landing = lazy(() => import("./landing/Landing.jsx"));
const ForgeApp = lazy(() => import("./app/ForgeApp.jsx"));

function BootScreen() {
  return (
    <div className="f-boot" role="status" aria-live="polite">
      <div className="f-boot-mark" aria-hidden="true" />
      <span className="f-eyebrow">Memanaskan tungku</span>
    </div>
  );
}

export default function Forge() {
  const path = usePath();
  const inApp = path === "/app" || path.startsWith("/app/");

  return (
    <Suspense fallback={<BootScreen />}>{inApp ? <ForgeApp path={path} /> : <Landing />}</Suspense>
  );
}
