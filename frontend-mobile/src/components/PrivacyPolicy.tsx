import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/components/SocialLinks';

const UPDATED = '3 October 2026';

/* One section of the policy: a heading plus paragraphs and optional bullets.
   Everything renders from the app's own design tokens, so light/dark themes
   and the display font follow automatically. */
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
          className="policy-body"
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

export default function PrivacyPolicy() {
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
        Privacy Policy
      </h1>
      <p
        className="mb-6"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}
      >
        Forestry PSC Preparation is a free exam-practice app. This policy says what
        we collect, why, where it lives, and what you can ask us to do with it —
        in plain language. If anything here changes, the date above changes with it.
      </p>

      <div className="grid gap-4">
        <Section title="1. What we collect, and why">
          <p><strong>Your account.</strong> A username, and a Gmail address if you add one. The address is <strong>encrypted</strong> before it is stored, so anyone reading the database directly sees ciphertext, not your inbox. We keep a one-way lookup tag alongside it so sign-in by address still works — the tag cannot be turned back into the address.</p>
          <p style={{ marginTop: '0.7rem' }}><strong>Your password.</strong> Never stored. We keep a bcrypt hash, which can verify a password but cannot reveal it — there is no “recover my password” that shows it to anyone, including us. Resetting means choosing a new one.</p>
          <p style={{ marginTop: '0.7rem' }}><strong>If you use Sign in with Google.</strong> Google proves you own the mailbox and hands us your Google account ID, name, address, and profile photo. We store the account ID (so the same Google account always finds the same history, even if you rename the address) and treat the address as verified on arrival — you never type a code.</p>
          <p style={{ marginTop: '0.7rem' }}><strong>Your study data.</strong> Quiz attempts, answers, scores, progress by category, bookmarks, notes, and your wrong-question queue. This is the point of the app: without it there is no progress tracking. Your public member number (e.g. FR-1042) is issued when your address is verified.</p>
          <p style={{ marginTop: '0.7rem' }}><strong>On your own device only.</strong> Sign-in token and user ID (browser storage), the offline question pack and any answers waiting to sync (IndexedDB), the app shell (service-worker cache), and display preferences such as theme, language, and sound. Deleting site data on your device removes these; signing in again restores everything the server holds.</p>
        </Section>

        <Section title="2. What we do not collect">
          <p>There is no analytics, no tracking pixel, no fingerprinting, and no advertising profile built by us. We do not sell, rent, or share your personal data with anyone except the service providers below, who receive only what they need to do their job. We never see your password and cannot decrypt anything you did not give us the keys to.</p>
        </Section>

        <Section title="3. Third parties that see something">
          <ul style={{ paddingLeft: '1.2rem', listStyle: 'disc', display: 'grid', gap: '0.5rem' }}>
            <li><strong>Google Sign-In</strong> (only if you use it): Google applies its own privacy policy to the sign-in moment and tells us the name, address, and photo on the account you chose.</li>
            <li><strong>Google Fonts:</strong> your browser fetches the Inter typeface from Google, which sees your IP address and browser version the way any website you visit does. No cookies are involved.</li>
            <li><strong>Google AdSense</strong> (advertising slots): Google and its partners may set cookies to choose and measure ads. These are theirs, not ours — see the <Link to="/cookies" style={{ color: 'hsl(var(--primary))' }}>Cookie Policy</Link> and Google’s ad settings to opt out of personalised ads.</li>
            <li><strong>Hosting and database</strong> (Render and Neon, US regions): they store the encrypted database and serve the app. They process data on our instructions and do not use it themselves.</li>
          </ul>
        </Section>

        <Section title="4. How long we keep it">
          <p>Account and study data stays until you ask us to remove it. Session tokens expire automatically. Server logs kept by the hosting provider rotate on their schedule, not ours. If the app ever shuts down, the database goes with it — we will not hand your data to anyone first.</p>
        </Section>

        <Section title="5. Your rights">
          <p>Write to <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'hsl(var(--primary))' }}>{CONTACT_EMAIL}</a> from the address on your account and we will: tell you what we hold about you, correct what is wrong, or delete your account and study data entirely. Deletion is manual today — there is deliberately no self-serve button yet, so this policy does not pretend one exists. We answer within a reasonable time and never charge for it.</p>
        </Section>

        <Section title="6. Children">
          <p>This is a Public Service Commission preparation app, built for adult aspirants. We do not knowingly collect data from children under 13; if you believe a child has registered, contact us and we will remove the account.</p>
        </Section>

        <Section title="7. Changes and contact">
          <p>Material changes appear here with a new date, and the app will point at them. Questions about anything above: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'hsl(var(--primary))' }}>{CONTACT_EMAIL}</a>.</p>
        </Section>
      </div>

      <p className="mt-6" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
        Related: <Link to="/terms" style={{ color: 'hsl(var(--primary))' }}>Terms of Service</Link> · <Link to="/cookies" style={{ color: 'hsl(var(--primary))' }}>Cookie Policy</Link>
      </p>
    </motion.div>
  );
}
