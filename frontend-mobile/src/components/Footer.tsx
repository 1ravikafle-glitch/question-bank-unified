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
        {/* Copyright and the channel icons are one unit: the icons follow the
            copyright line directly instead of floating free between the two
            text lines. Previously these were three sibling children of a
            space-between row, so each was pushed to a different offset and the
            group read as scattered — worst on a phone, where a column row
            centred every child independently and the icons ended up indented
            from anything. The brand group keeps them together at any width, and
            the credit sits at the far end on desktop / below on a phone. */}
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
