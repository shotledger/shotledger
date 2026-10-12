// The Tags field of Enter Series (docs/specs/web-entry-tags-spec.md §3.3):
// the phone's session-edit tag row — the chosen names, each a remove button,
// then a name field and Add. The account's tags are offered as suggestions.
import { TEXT_LIMITS } from '@shotledger/shared/src/sync';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { tagSuggestions } from './tags';

export function TagsField({
  tags,
  chosen,
  onAdd,
  onRemove,
}: {
  /** The pulled `tags` rows. */
  tags: ReadonlyMap<string, Record<string, unknown>>;
  chosen: readonly string[];
  onAdd: (typed: string) => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const add = () => {
    onAdd(text);
    setText('');
  };
  // Enter adds the tag rather than saving; Ctrl/Cmd+Enter still saves.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    add();
  };

  return (
    <section className="card entry-tags">
      <label htmlFor="entry-tag">{t('session.tags')}</label>
      {chosen.length > 0 && (
        <ul className="tags">
          {chosen.map((name) => (
            <li key={name}>
              <button
                type="button"
                aria-label={t('session.removeTag', { name })}
                onClick={() => onRemove(name)}
              >
                {`${name} ×`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="entry-tag-add">
        <input
          id="entry-tag"
          value={text}
          list="entry-tag-suggestions"
          placeholder={t('session.tagPlaceholder')}
          maxLength={TEXT_LIMITS.tags.name}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="secondary" onClick={add}>
          {t('session.addTag')}
        </button>
      </div>
      <datalist id="entry-tag-suggestions">
        {tagSuggestions(tags, chosen).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </section>
  );
}
