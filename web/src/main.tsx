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
