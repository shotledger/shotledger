// First: zod must be jitless before any schema is defined (the CSP has no 'unsafe-eval').
import '@shotledger/shared/src/zod-jitless';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n';
import './styles.css';
import { App } from './app';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
