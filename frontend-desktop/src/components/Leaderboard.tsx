import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchLeaderboard, type Leaderboard, type LeaderboardRow } from '../services/api';

/* Weekly global ranking.
 *
 * The server masks every account and then unmasks only the caller's own row,
 * so nothing here ever holds another person's real name.
 *
 * Each row prints its own arithmetic, because the score is a formula rather
 * than a verdict and a ranking that will not show its working is one nobody
 * should trust. */

/* Gold, silver and bronze from the existing palette rather than literal hex:
 *   1st  --bookmark    amber, the closest thing to gold the system has
 *   2nd  --tone-review cool blue, which reads as silver next to the gold
 *   3rd  --flag-600    burnt copper, which is what bronze is
 * Anything past the podium uses the muted foreground and no trophy. */
const podiumTone = (rank: number) =>
  rank === 1 ? 'var(--bookmark)' : rank === 2 ? 'var(--tone-review)' : rank === 3 ? 'var(--flag-600)' : null;

const TROPHIES: Record<number, string> = { 1: '🏆', 2: '🥈', 3: '🥉' };

/* The trophy sits beside the rank for the podium places, so the top three read
 * as places rather than as three more list rows. */
function RankBadge({ rank }: { rank: number }) {
  const tone = podiumTone(rank);
  if (!tone) {
    return (
      <span
        style={{
          minWidth: '2rem',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        #{rank}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', minWidth: '3.4rem' }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.6rem',
          height: '1.6rem',
          borderRadius: '999px',
          fontSize: '0.8125rem',
          background: `hsl(${tone} / 0.14)`,
          border: `1px solid hsl(${tone} / 0.45)`,
          flexShrink: 0,
        }}
      >
        {TROPHIES[rank]}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: `hsl(${tone})`,
        }}
      >
        {rank}
      </span>
    </span>
  );
}

function Row({
  r,
  delay,
  topScore,
  total,
}: {
  r: LeaderboardRow;
  delay: number;
  topScore: number;
  total: number;
}) {
  const tone = podiumTone(r.rank);
  const onPodium = tone !== null;
  // Bar length carries the rank: full width is the leader. The floor keeps a
  // low score visible instead of collapsing to an invisible sliver.
  const fill = topScore > 0 ? Math.max(5, (r.score / topScore) * 100) : 5;
  const gap = total > 1 ? (r.rank - 1) / (total - 1) : 0;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: onPodium ? '0.85rem 0.9rem' : '0.7rem 0.8rem',
        borderRadius: 'var(--apple-radius-md)',
        border: `1px solid ${
          r.is_you ? 'hsl(var(--primary) / 0.45)' : tone ? `hsl(${tone} / 0.35)` : 'hsl(var(--border))'
        }`,
        background: r.is_you
          ? 'hsl(var(--primary) / 0.07)'
          : tone
            ? `hsl(${tone} / 0.07)`
            : 'hsl(var(--card))',
        boxShadow: onPodium ? 'var(--shadow-sm)' : undefined,
        listStyle: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <span style={{ paddingTop: '0.1rem' }}>
          <RankBadge rank={r.rank} />
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontFamily: onPodium ? 'var(--font-display)' : 'var(--font-sans)',
              fontSize: onPodium ? '1rem' : '0.875rem',
              fontWeight: onPodium ? 'var(--font-weight-bold)' : 'var(--font-weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'hsl(var(--foreground))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.name}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '0.6875rem',
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-mono)',
              marginTop: '0.15rem',
            }}
          >
            {r.breakdown}
          </span>
        </span>

        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: onPodium ? '1.0625rem' : '0.9375rem',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-tight)',
              color: 'hsl(var(--foreground))',
            }}
          >
            {r.score.toFixed(1)}
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {' '}
              pts
            </span>
          </span>
          {/* Both windows, labelled. The gate is lifetime and the score is
              weekly, so showing one without the other makes the other look
              arbitrary. */}
          <span
            style={{
              display: 'block',
              fontSize: '0.6875rem',
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
          >
            {r.questions.toLocaleString()} q · {r.accuracy.toFixed(1)}%
          </span>
        </span>
      </div>

      {/* Lifetime strip. Deliberately quieter than the week line above: this is
          the qualification, not the achievement, so it should read as context
          rather than compete with the score for attention. */}
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.4rem',
          fontSize: '0.625rem',
          color: 'hsl(var(--muted-foreground) / 0.75)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span
          style={{
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: '0.5625rem',
          }}
        >
          Lifetime
        </span>
        <span>
          {r.lifetime_questions.toLocaleString()} q · {r.lifetime_accuracy.toFixed(1)}%
        </span>
      </span>

      {/* The rank bar: length is the score against the leader, so the shape of
          the field is legible before anyone reads a number. */}
      <div
        aria-hidden="true"
        style={{ height: onPodium ? '5px' : '4px', borderRadius: '999px', background: 'hsl(var(--muted))', overflow: 'hidden' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fill}%` }}
          transition={{ duration: 0.55, delay: delay + 0.08, ease: [0.25, 0.1, 0.25, 1] }}
          style={{
            height: '100%',
            borderRadius: '999px',
            background: r.is_you
              ? 'hsl(var(--primary))'
              : tone
                ? `hsl(${tone})`
                : 'hsl(var(--primary) / 0.45)',
          }}
        />
      </div>

      {/* Where this row sits in the field, stated in words for the rows that a
          bar alone would not communicate. */}
      {onPodium && (
        <span
          style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            color: `hsl(${tone})`,
          }}
        >
          {r.rank === 1 ? 'Leading the week' : `${Math.round(gap * 100)}% behind the leader`}
        </span>
      )}
    </motion.li>
  );
}

const Leaderboard: React.FC = () => {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetchLeaderboard()
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
        The ranking could not be loaded. Try again in a moment.
      </p>
    );
  }
  if (!data) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
        Loading the ranking…
      </p>
    );
  }

  const mine = data.you;
  const inList = (r: LeaderboardRow) => data.rows.some((x) => x.is_you);
  const empty = data.rows.length === 0;
  const topScore = data.rows.length ? data.rows[0].score : 0;
  const total = Math.max(data.eligible_count, data.rows.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <p
        style={{
          fontSize: '0.75rem',
          color: 'hsl(var(--muted-foreground))',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {data.window.label} · resets every Sunday ({data.window.timezone})
      </p>

      {/* How the score is built. A rank you cannot check is a rank you cannot
          argue with, which is not the same as being right. */}
      <details
        style={{
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--apple-radius-md)',
          background: 'hsl(var(--muted) / 0.5)',
          padding: '0.5rem 0.7rem',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'hsl(var(--muted-foreground))',
            listStyle: 'none',
          }}
        >
          How the ranking works
        </summary>
        <div
          style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))',
            marginTop: '0.5rem',
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          <p style={{ margin: '0 0 0.4rem' }}>
            <strong style={{ color: 'hsl(var(--foreground))' }}>
              score = this week&rsquo;s accuracy% × (1 + log₁₀(this week&rsquo;s questions))
            </strong>
          </p>
          <p style={{ margin: '0 0 0.4rem' }}>
            Accuracy is the multiplier, so it decides the order. The number of questions only scales
            the result, and a logarithm means that grinding the whole bank cannot overtake simply
            being accurate.
          </p>
          <p style={{ margin: '0 0 0.4rem' }}>
            To appear at all, an account needs more than {data.eligibility.min_distinct_questions}{' '}
            distinct questions <strong>in total</strong>. That is a lifetime bar, not a weekly one, so
            joining is a standing achievement. The score itself is recalculated from scratch every
            week, so last month&rsquo;s practice cannot carry anyone.
          </p>
          <p style={{ margin: 0 }}>
            Every row shows both: this week&rsquo;s figures are what the score is made of, and the
            lifetime figures are why the account is allowed to compete. Every other account is masked
            before the ranking leaves the server; you see your own name in full.
          </p>
        </div>
      </details>

      {empty ? (
        <div
          style={{
            textAlign: 'center',
            padding: '1.75rem 1.25rem',
            borderRadius: 'var(--apple-radius-md)',
            border: '1px dashed hsl(var(--border))',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }} aria-hidden="true">
            🏁
          </div>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
              margin: '0 0 0.25rem',
            }}
          >
            Nobody has qualified yet
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            An account joins the ranking once it has passed{' '}
            {data.eligibility.min_distinct_questions} distinct questions in total. Each week it
            then competes on that week's own practice.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
        >
          {data.rows.map((r, i) => (
            <Row key={`${r.rank}-${r.name}`} r={r} delay={Math.min(i, 12) * 0.03} topScore={topScore} total={total} />
          ))}
        </ul>
      )}

      {/* Your own standing, shown even when you are outside the top slice. */}
      {mine && !inList(mine) && (
        <div>
          <p
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              color: 'hsl(var(--muted-foreground))',
              margin: '0 0 0.4rem 0.2rem',
            }}
          >
            Your standing
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            <Row r={mine} delay={0} topScore={topScore} total={total} />
          </ul>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
