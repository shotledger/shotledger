// An ⓘ whose text shows on hover and on keyboard focus; Escape hides it
// (WCAG 1.4.13). The web's place for help: no inline teaching text.
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function Hint({ text }: { text: string }) {
  const { t } = useTranslation();
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={dismissed ? 'hint dismissed' : 'hint'}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      <span
        className="hint-icon"
        role="img"
        tabIndex={0}
        aria-label={t('web.hint')}
        aria-describedby={id}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        i
      </span>
      <span className="hint-text" role="tooltip" id={id}>
        {text}
      </span>
    </span>
  );
}
