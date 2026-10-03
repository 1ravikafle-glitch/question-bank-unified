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

export default function TermsOfService() {
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
        Terms of Service
      </h1>
      <p
        className="mb-6"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}
      >
        The rules for using Forestry PSC Preparation. Using the app means you
        accept them. Short version: it is free, it is for studying, don’t abuse
        it, and the questions are practice material, not the exam.
      </p>

      <div className="grid gap-4">
        <Section title="1. The service">
          <p>Forestry PSC Preparation is a free multiple-choice practice app for Nepal’s forestry public-service examinations. No account costs anything, and no feature is paywalled. We may change, pause, or end any part of the service; the offline question pack on your device keeps working with whatever it already holds.</p>
        </Section>

        <Section title="2. Your account">
          <ul style={{ paddingLeft: '1.2rem', listStyle: 'disc', display: 'grid', gap: '0.5rem' }}>
            <li><strong>One account per person.</strong> Register with a username and password, or with Sign in with Google. One click, no codes, and your address is verified on arrival because Google already proved it.</li>
            <li><strong>Keep it yours.</strong> Do not share your password. You are responsible for what happens under your account until you tell us it was taken over.</li>
            <li><strong>Member numbers</strong> (e.g. FR-1042) are issued once, when your address is verified, and never change. They identify your study history, not you personally.</li>
            <li><strong>Password resets</strong> are rate-limited to stop abuse. If you hammer the reset endpoint you will be temporarily refused. That is the protection working, not a bug.</li>
          </ul>
        </Section>

        <Section title="3. Acceptable use">
          <p>Use the app for studying. In particular:</p>
          <ul style={{ paddingLeft: '1.2rem', listStyle: 'disc', display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
            <li>Do not scrape, bulk-download, or republish the question bank. Personal offline practice through the app’s own pack is the intended offline use.</li>
            <li>Do not probe, flood, or automate the sign-in, registration, or password-reset endpoints. Automated abuse is refused by rate limits and can get the account behind it suspended.</li>
            <li>Do not upload anything illegal, or anything you do not have the right to share, through Contribute or Past Papers, including papers whose publisher forbids redistribution.</li>
            <li>Do not pretend to be another user, a moderator, or the site itself.</li>
          </ul>
        </Section>

        <Section title="4. Content and copyright">
          <p><strong>© {new Date().getFullYear()} Forestry PSC Preparation. All rights reserved.</strong></p>
          <p style={{ marginTop: '0.7rem' }}>The question bank, explanations, interface, and design belong to us (or to the licensors credited with them) and may not be copied, repackaged, or sold without written permission. Past papers and third-party material remain the property of their publishers and appear for study reference only.</p>
          <p style={{ marginTop: '0.7rem' }}>By submitting a question, explanation, or other contribution, you confirm it is yours to share and you grant us a permanent, royalty-free licence to display, adapt, and distribute it inside the app. You keep ownership of what you wrote.</p>
          <p style={{ marginTop: '0.7rem' }}><strong>Takedowns.</strong> If anything here infringes your copyright, write to <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'hsl(var(--primary))' }}>{CONTACT_EMAIL}</a> naming the page and what is yours. We remove or credit promptly, and repeat offenders lose their accounts.</p>
        </Section>

        <Section title="5. No exam promises">
          <p>This is practice material, not the examination. Questions may contain errors, the syllabus may have moved on, and nothing here guarantees selection. We are not affiliated with the Public Service Commission (Lok Sewa Aayog) or any government body; “Loksewa MCQ” in the footer describes the content type, not an endorsement. If you spot a wrong answer, tell us. Corrections help everyone.</p>
        </Section>

        <Section title="6. Availability, suspension, liability">
          <p>We run this on a best-effort basis: no guaranteed uptime, no guaranteed data preservation beyond what the <Link to="/privacy" style={{ color: 'hsl(var(--primary))' }}>Privacy Policy</Link> promises. Accounts used abusively (spam, scraping, credential abuse, infringing uploads) may be suspended or removed, with or without warning depending on severity. To the extent the law allows, the service is provided “as is” and we are not liable for exam outcomes, lost study data beyond our control, or reliance on any answer key.</p>
        </Section>

        <Section title="7. Law, changes, contact">
          <p>These terms are governed by the laws of Nepal. Disputes go first to a good-faith email exchange; failing that, to the courts of Kathmandu. Material changes appear here with a new date, and continued use after a change means acceptance. Anything unclear: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'hsl(var(--primary))' }}>{CONTACT_EMAIL}</a>.</p>
        </Section>
      </div>

      <p className="mt-6" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
        Related: <Link to="/privacy" style={{ color: 'hsl(var(--primary))' }}>Privacy Policy</Link> · <Link to="/cookies" style={{ color: 'hsl(var(--primary))' }}>Cookie Policy</Link>
      </p>
    </motion.div>
  );
}
