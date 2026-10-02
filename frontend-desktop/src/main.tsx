import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/variables.css'
import './styles/globals.css'
import './styles/components.css'
import './styles/utilities.css'

const container = document.getElementById('root') as HTMLElement
ReactDOM.createRoot(container).render(
  <App />
);

/* index.html ships a static splash inside #root so the page is never blank
   while this bundle downloads and parses. Do NOT remove it by hand:
   createRoot replaces the container's children on its first commit, so React
   clears it at exactly the right moment. An earlier attempt dropped it on a
   double requestAnimationFrame (~32ms), which left the blank gap it was meant
   to cover - React does not paint for ~600ms on a cold load. */

// Offline shell: register the service worker (prime cache happens in-app).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}