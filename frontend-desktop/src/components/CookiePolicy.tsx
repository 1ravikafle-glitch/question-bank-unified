import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/components/SocialLinks';

const UPDATED = '3 October 2026';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent style={{ padding: '1.4rem 1.5rem' }}>
        <h2
          className="font-bold mb-3"
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}
        >
          {title}
        </h2>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ where, what, why }: { where: string; what: string; why: string }) {
  return (
    <div
      className="grid gap-1 rounded-xl"
      style={{ padding: '0.7rem 0.85rem', background: 'hsl(var(--muted) / 0.45)', gridTemplateColumns: '1fr' }}
    >
      <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{what}</div>
      <div style={{ fontSize: '0.82rem' }}>{where}</div>
      <div style={{ fontSize: '0.82rem' }}>{why}</div>
    </div>
  );
}

export default function CookiePolicy() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } }}
      className="w-full mx-auto pt-4 pb-8"
      style={{ maxWidth: '46rem' }}
    >
      <p
        className="mb-1"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}
      >
        Last updated: {UPDATED}
      </p>
      <h1
        className="font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}
      >
        Cookie Policy
      </h1>
      <p
        className="mb-6"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}
      >
        We set no tracking cookies of our own. Staying signed in, remembering
        your preferences, and working offline all use your browser’s own storage
        on your device, plus a small number of third-party cookies from the ad
        slots and the Google sign-in flow, listed below with what each one does.
      </p>

      <div className="grid gap-4">
        <Section title="1. What lives in your browser, and why">
          <div className="grid gap-2">
            <Row where="Where: browser localStorage · upto sign-out" what="Sign-in token and user ID" why="Why: keeps you signed in between visits. Logging out deletes the token." />
            <Row where="Where: browser localStorage · until you clear it" what="Theme, language, and sound preferences" why="Why: the app opens the way you left it. Nothing leaves your device." />
            <Row where="Where: IndexedDB (‘forestry-offline’) · refreshed weekly" what="Offline question pack and unsynced answers" why="Why: practice works with no internet; answers sync when you are back online." />
            <Row where="Where: Cache Storage (‘forestry-v*’) · replaced on each update" what="App shell (pages, scripts, styles, icons)" why="Why: instant loads and offline deep links. Old versions are evicted automatically." />
          </div>
        </Section>

        <Section title="2. Third-party cookies and requests">
          <ul style={{ paddingLeft: '1.2rem', listStyle: 'disc', display: 'grid', gap: '0.5rem' }}>
            <li><strong>Google AdSense</strong> (ad slots): Google and its ad partners may set cookies to select, limit, and measure ads, including personalised ads based on your browsing. Turn personalisation off in your Google ad settings; the slots keep working with non-personalised ads.</li>
            <li><strong>Sign in with Google</strong> (only while signing in): Google uses its own cookies to run the account chooser and verify you. Once you return to the app, only our sign-in token above remains.</li>
            <li><strong>Google Fonts:</strong> fetches the typeface with no cookies, but Google sees the request (IP address, browser version) like any site you visit.</li>
          </ul>
        </Section>

        <Section title="3. Managing them">
          <p>Block or clear anything through your browser’s site settings. No permission prompt is needed because nothing here tracks you across sites. Consequences, honestly stated: clearing storage signs you out and the offline pack re-downloads next visit (about a megabyte); blocking third-party cookies may narrow ad choice but breaks nothing in the app itself.</p>
        </Section>

        <Section title="4. Changes and contact">
          <p>New storage gets a new line in section 1 and a new date above. Questions: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'hsl(var(--primary))' }}>{CONTACT_EMAIL}</a>.</p>
        </Section>
      </div>

      <p className="mt-6" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
        Related: <Link to="/privacy" style={{ color: 'hsl(var(--primary))' }}>Privacy Policy</Link> · <Link to="/terms" style={{ color: 'hsl(var(--primary))' }}>Terms of Service</Link>
      </p>
    </motion.div>
  );
}
