import type React from 'react';
import { SocialIcons } from '@/components/SocialLinks';

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
      <div>
        {/* Copyright and the channel icons are one unit: the icons follow the
            copyright line directly instead of floating free between the two
            text lines. Previously these were three sibling children of a
            space-between row, each at a different offset, so the group read as
            scattered. The brand block keeps them together at any width and the
            credit sits at the far end. */}
        <div className="site-footer-row">
          <div className="site-footer-brand">
            <p className="site-footer-copy">
              © {year}{' '}
              <span className="site-footer-name">Forestry PSC Preparation</span>
              {' '}· Loksewa MCQ · Success
            </p>
            <div className="footer-social-wrap">
              <span className="footer-social-label" aria-hidden="true">
                Follow
              </span>
              <SocialIcons />
            </div>
          </div>
          <p className="site-footer-credit">
            <span className="site-footer-crafted">Crafted for preparation</span>
            {' '}·{' '}
            <a
              href="https://ravikafle.com.np"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline underline-offset-2 transition-colors"
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
