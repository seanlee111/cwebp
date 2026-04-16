import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// Dev-only: expose converter on window for manual DevTools verification
// (tasks.md T-09). Stripped from production build by Vite tree-shaking
// since `import.meta.env.DEV` folds to `false`.
if (import.meta.env.DEV) {
  void import('./core/converter').then((m) => {
    (window as unknown as Record<string, unknown>)['__convertToWebP'] =
      m.convertToWebP;
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
