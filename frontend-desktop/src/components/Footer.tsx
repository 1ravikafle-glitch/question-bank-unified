import type React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full"
      style={{
        background: 'transparent',
        borderTop: '1px solid hsl(var(--border) / 0.35)',
        marginTop: '0.35rem',
        paddingBottom: '1px',
      }}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div
        className="w-full pt-[3px] pb-[2px]"
        style={{
          paddingLeft: 'var(--page-gutter)',
          paddingRight: 'var(--page-gutter)',
        }}
      >
        <div className="site-footer-inner">
          <p
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8rem',
              fontWeight: 400,
              letterSpacing: '0.02em',
              margin: 0,
              flex: '1 1 auto',
              minWidth: 0,
              overflowWrap: 'break-word',
              lineHeight: 1.5,
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
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.79rem',
              fontWeight: 400,
              letterSpacing: '0.01em',
              margin: 0,
              flex: '0 1 auto',
              minWidth: 0,
              overflowWrap: 'break-word',
              lineHeight: 1.5,
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
