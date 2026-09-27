import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/variables.css'
import './styles/globals.css'
import './styles/components.css'
import './styles/utilities.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)

// Offline support: cache app shell + API reads for subway-mode practice.
// Register immediately (not on window.load — ad/font requests can delay it).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Prime the runtime cache with this page's assets (worker may have
  // installed after they first loaded).
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(prime, 3000);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(prime, 3000));
  }
  function prime() {
    import('@/utils/offline').then((m) => m.primeCache().catch(() => {}));
  }
}