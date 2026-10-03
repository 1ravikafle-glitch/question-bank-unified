import FeedbackSection from '@/components/FeedbackSection';
import { fetchMyFeedback, sendFeedback } from '@/services/api';
import { motion } from 'framer-motion';

/* Full-page anonymous feedback: suggestions with private admin replies.
   Linked from Settings, the mobile More sheet, and About. */
export default function FeedbackPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } }}
      className="w-full mx-auto pt-4 pb-8"
      style={{ maxWidth: '46rem' }}
    >
      <h1
        className="font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}
      >
        Feedback
      </h1>
      <p
        className="mb-6"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}
      >
        Suggest an improvement, report a problem, or ask for a feature.
      </p>
      <FeedbackSection list={fetchMyFeedback} send={sendFeedback} />
    </motion.div>
  );
}
