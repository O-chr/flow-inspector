// Entry point: create the React root exactly once, then mount App.
// App lives in app.jsx (exported, not self-rendering) so Vite HMR can hot-swap
// it without re-invoking createRoot on the same container.
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './app.jsx'

createRoot(document.getElementById('root')).render(<App />)
