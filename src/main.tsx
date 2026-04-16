import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// Dev-only: expose encoder on window for manual DevTools verification.
// Stripped from production build by Vite tree-shaking since
// `import.meta.env.DEV` folds to `false`.
if (import.meta.env.DEV) {
  void import('./core/encoder').then((m) => {
    (window as unknown as Record<string, unknown>)['__encode'] = m.encode;
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
