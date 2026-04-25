import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/colors_and_type.css'
import './themes/scale.css'
import './themes/extra.css'
import './index.css'
import App from './App.tsx'
import {
  applyEffects,
  applyScale,
  applyTheme,
  loadEffects,
  loadScale,
  loadTheme,
} from './themes'

applyTheme(loadTheme())
applyScale(loadScale())
applyEffects(loadEffects())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
