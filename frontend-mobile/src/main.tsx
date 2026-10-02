import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/variables.css'
import './styles/globals.css'
import './styles/components.css'
import './styles/utilities.css'
// iOS layer: safe areas, dvh, 16px inputs, tap/scroll behavior fixes.
import './styles/ios.css'
// Responsive scale layer: fluid type, landscape phones, tablets, small screens.
import './styles/responsive.css'

const container = document.getElementById('root') as HTMLElement
ReactDOM.createRoot(container).render(
  <App />
)

/* index.html ships a static splash inside #root so the page is never blank
   while this bundle downloads and parses. Do NOT remove it by hand:
   createRoot replaces the container's children on its first commit, so React
   clears it at exactly the right moment. An earlier attempt dropped it on a
   double requestAnimationFrame (~32ms), which left the blank gap it was meant
   to cover - React does not paint for ~600ms on a cold load. */

/* Speed: prefetch every route chunk + stats the moment the browser is idle.
   Routes are code-split — without this the first tap on Practice/Questions
   waits on a network round-trip; with it, navigation is instant (chunks are
   already in cache). requestIdleCallback keeps this off the critical path. */
const warmup = () => {
  import('./components/QuizTaker').catch(() => {});
  import('./components/QuestionsBank').catch(() => {});
  import('./components/ResultsScreen').catch(() => {});
  import('./components/ProgressTracker').catch(() => {});
  import('./services/api').then((m) => m.prefetchStats()).catch(() => {});
};
if ('requestIdleCallback' in window) {
  (window as any).requestIdleCallback(warmup, { timeout: 3000 });
} else {
  setTimeout(warmup, 1500);
}

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