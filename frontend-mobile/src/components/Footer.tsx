import { useLocation } from 'react-router-dom';
import { SocialIcons } from '@/components/SocialLinks';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  const location = useLocation();
  const isQuiz = location.pathname.startsWith('/quiz');

  return (
    <footer
      id="mobile-site-footer"
      className="w-full"
      style={{
        background: 'transparent',
        borderTop: '1px solid hsl(var(--border) / 0.35)',
        opacity: isQuiz ? 0.18 : 1,
        marginTop: '0.35rem',
        // No inline padding-bottom: the stylesheet owns it, since it has to
        // clear the fixed bottom nav on phones and an inline value would win.
      }}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div
        className="w-full pt-[3px] pb-[2px]"
        style={{
          paddingLeft: '5%',
          paddingRight: '5%',
        }}
      >
        <div className="site-footer-row flex flex-row items-center justify-between gap-1 flex-wrap">
          <p
            className="whitespace-nowrap leading-none"
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8rem',
              fontWeight: 400,
              letterSpacing: '0.02em',
              margin: 0,
            }}
          >
            © {year}{' '}
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'hsl(var(--foreground) / 0.8)',
                letterSpacing: '-0.005em',
              }}
            >
              Forestry PSC Preparation
            </span>
            {' '}· Loksewa MCQ · Success
          </p>
          {/* Channel links sit BETWEEN the copyright and the credit line, so
              the branding reads copyright - follow - credit rather than piling
              every icon off the right edge. */}
          <div className="footer-social-wrap">
            <span
              aria-hidden="true"
              style={{
                color: 'hsl(var(--muted-foreground))',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.74rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                opacity: 0.8,
              }}
            >
              Follow
            </span>
            <SocialIcons />
          </div>
          <p
            className="whitespace-nowrap leading-none"
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.79rem',
              fontWeight: 400,
              letterSpacing: '0.01em',
              margin: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: '0.79rem',
                fontWeight: 500,
                opacity: 0.75,
              }}
            >
              Crafted for preparation
            </span>
            {' '}·{' '}
            <a
              href="https://ravikafle.com.np"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline underline-offset-2 transition-colors"
              style={{
                color: 'hsl(var(--primary))',
                fontSize: '0.79rem',
                fontWeight: 500,
              }}
            >
              ravikafle.com.np
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
