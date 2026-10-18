import { useState } from 'react'
import type { AppUpdateState } from '../hooks/useAppUpdate'
import { APP_VERSION, parseAppVersion, versionLabel } from '../data/appVersion'

const DEVELOPER = 'eekorchagin-cyber'
const DEVELOPER_URL = `https://github.com/${DEVELOPER}`
const COPYRIGHT_YEAR = 2026

export function AboutScreen({ update }: { update: AppUpdateState }) {
  const version = parseAppVersion()
  const [checkResult, setCheckResult] = useState<string | null>(null)

  async function checkNow() {
    setCheckResult(null)
    const remote = await update.check()
    if (!remote) setCheckResult('Не удалось проверить: нет связи с сервером.')
    else if (remote.version === APP_VERSION) setCheckResult('У вас последняя версия.')
    else setCheckResult(`Доступна версия ${versionLabel(remote.version)} — нажмите «Обновить» вверху экрана.`)
  }

  return (
    <div className="stack">
      <div className="panel stack about-hero">
        <img className="about-icon" src="./icons/app-192.png" alt="" />
        <strong className="about-title">KeepIt</strong>
        <span className="muted">Домашнее хранение: места, вещи и QR-метки</span>
      </div>

      <div className="panel stack">
        <strong>Версия программы</strong>
        <p>
          Версия {version.number}
          {version.date ? ` от ${version.date}${version.time ? `, ${version.time}` : ''}` : ''}
        </p>
        <button type="button" className="secondary" disabled={update.checking} onClick={() => void checkNow()}>
          {update.checking ? 'Проверяю…' : 'Проверить обновления'}
        </button>
        {checkResult ? <p className="muted">{checkResult}</p> : null}
      </div>

      <div className="panel stack">
        <strong>Разработчик</strong>
        <a href={DEVELOPER_URL} target="_blank" rel="noreferrer">
          {DEVELOPER} на GitHub
        </a>
        <span className="muted">
          © {COPYRIGHT_YEAR} {DEVELOPER}. Все права защищены.
        </span>
      </div>
    </div>
  )
}
