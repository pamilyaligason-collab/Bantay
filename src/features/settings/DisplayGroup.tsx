import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { applyTheme, THEME_KEY, type ThemePref } from '../shell/theme'
import { applyTextSize, isTextSize, TEXT_SIZE_KEY, TEXT_SIZES, type TextSize } from '../shell/textSize'
import { useKv } from '../shell/useKv'
import { isLang, LANG_KEY, LANGS, setLang, type Lang } from '../../lib/i18n'
import ChoiceSheet from './ChoiceSheet'
import Group, { NavRow } from './Group'

export const THEMES: { id: ThemePref; label: string }[] = [{ id: 'system', label: 'System default' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]
const label = <T extends string>(list: { id: T; label: string }[], id: T) => list.find((x) => x.id === id)?.label ?? ''

/** Settings > Display (#me/display): Text size ("Bigger text" lives only here, A-21), Theme, Language. Each opens a choice sheet. */
export default function DisplayGroup() {
  const [theme, setTheme] = useKv<ThemePref>(THEME_KEY, 'system')
  const [textSize, setTextSize] = useKv<TextSize>(TEXT_SIZE_KEY, 'normal')
  const [lang, setLangKv] = useKv<Lang>(LANG_KEY, 'en')
  const [open, setOpen] = useState<'text' | 'theme' | 'lang' | null>(null)
  const size = isTextSize(textSize) ? textSize : 'normal'
  const lg = isLang(lang) ? lang : 'en'
  const close = () => setOpen(null)
  return (
    <Group title="Display" testId="settings-display">
      <div className="sh-card sh-list st-list">
        <NavRow icon="search" title="Text size" sub={label(TEXT_SIZES, size)} onClick={() => setOpen('text')} popup />
        <NavRow icon="moon" title="Theme" sub={label(THEMES, theme)} onClick={() => setOpen('theme')} popup />
        <NavRow icon="chat" title="Language" sub={label(LANGS, lg)} onClick={() => setOpen('lang')} popup />
      </div>
      <p className="sh-sub sh-note">Filipino changes medicine reminders, weather advice, Quick dial and SOS status. The rest of the app stays in English{Capacitor.isNativePlatform() ? '.' : '. Reminders are on the Android app.'}</p>
      {open === 'text' && <ChoiceSheet title="Text size" value={size} options={TEXT_SIZES} note="Bigger text makes words and buttons larger." onClose={close} onPick={(t) => { setTextSize(t); applyTextSize(t) }} />}
      {open === 'theme' && <ChoiceSheet title="Theme" value={theme} options={THEMES} onClose={close} onPick={(t) => { setTheme(t); applyTheme(t) }} />}
      {open === 'lang' && <ChoiceSheet title="Language" value={lg} options={LANGS} onClose={close} onPick={(l) => { setLangKv(l); void setLang(l) }} />}
    </Group>
  )
}
