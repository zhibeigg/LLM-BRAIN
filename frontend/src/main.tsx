import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeContextProvider } from './ThemeContext'
import { I18nProvider } from './i18n'
import App from './App'
import './index.css'
import { registerServiceWorker } from './services/pwa'

// 注册 Service Worker
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeContextProvider>
        <App />
      </ThemeContextProvider>
    </I18nProvider>
  </StrictMode>,
)
