import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store.js';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a crash anywhere — the store included — still gets the rescue screen. */}
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Register the offline service worker in production only (dev keeps HMR clean).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline shell is a progressive enhancement; ignore failures */
    });
  });
}
