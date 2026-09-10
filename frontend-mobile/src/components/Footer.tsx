import { useLocation } from 'react-router-dom';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  const location = useLocation();
  const isQuiz = location.pathname.startsWith('/quiz');

  return (
    <footer
      className="w-full"
      style={{
        background: 'transparent',
        borderTop: '1px solid hsl(var(--border) / 0.35)',
        opacity: isQuiz ? 0.18 : 1,
        marginTop: '0.35rem',
        paddingBottom: '1px',
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
        <div className="flex flex-row items-center justify-between gap-1 flex-wrap">
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
