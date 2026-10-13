import { getLanguage, languages, setLanguage, translate, useLanguage } from '../i18n'

export function LanguageSelector() {
  useLanguage()
  return (
    <select
      aria-label={translate('Sprache')}
      title={translate('Sprache')}
      data-testid="language-selector"
      value={getLanguage()}
      onChange={(event) => setLanguage(event.target.value)}
      className="shrink-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 focus:border-sky-500 focus:outline-none"
    >
      {languages.map((language) => <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>)}
    </select>
  )
}
