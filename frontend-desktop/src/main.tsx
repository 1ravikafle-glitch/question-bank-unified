import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/variables.css'
import './styles/globals.css'
import './styles/components.css'
import './styles/utilities.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
);

// Offline shell: register the service worker (prime cache happens in-app).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}