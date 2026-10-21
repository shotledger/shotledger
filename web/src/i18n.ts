// The app's own strings (ARCHITECTURE.md § Web app: imported, not restated).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../../app/src/i18n/en.json';
import sv from '../../app/src/i18n/sv.json';

const language = navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sv: { translation: sv } },
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = language;

export default i18n;
