import { useEffect } from 'react'
import shell from './orito/shell.html?raw'
import './orito/styles.css'
import './orito/onboarding.css'

/**
 * 折りGO runs as the dependency-free web app from the handoff pack (src/orito/*.js).
 * React only provides the document shell; app.js wires every screen once the markup exists.
 */
let started = false

export default function App() {
  useEffect(() => {
    if (started) return
    started = true
    void import('./orito/app.js')
  }, [])
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: shell }} />
}
