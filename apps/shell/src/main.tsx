import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { refreshAllLookupCaches } from './features/lookups/lookupCache'
import { startFrontendCacheRefreshScheduler } from './utils/cacheRefreshScheduler'
// import "./index.css";


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

startFrontendCacheRefreshScheduler({ refresh: refreshAllLookupCaches });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
