import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker with controlled update checks.
// Automatic browser installation banners are suppressed and only triggered on explicit user action.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('[PWA] New version of Shoe POS available.');
    },
    onOfflineReady() {
      console.log('[PWA] Shoe POS ready for offline counter usage.');
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration notice:', error);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
