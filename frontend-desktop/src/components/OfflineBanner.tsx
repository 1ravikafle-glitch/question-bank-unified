import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { submitQuiz, fetchQuestions, fetchQuestionsCount, clearWrongQueue } from '@/services/api';
import { isOnline, pendingCount, syncOutbox, packInfo, ensurePack } from '@/utils/offline';

/* Offline status pill + automatic outbox sync on reconnect. */
const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [hasPack, setHasPack] = useState(false);

  useEffect(() => {
    let alive = true;
    const trySync = async () => {
      if (!isOnline()) return;
      const n = await pendingCount();
      if (n === 0) return;
      try {
        const synced = await syncOutbox(submitQuiz, clearWrongQueue);
        if (synced > 0) toast.success(`Synced ${synced} offline quiz${synced > 1 ? 'zes' : ''}`);
      } catch {
        toast.error('Some offline results could not sync yet — will retry.');
      }
      refresh();
    };
    const refresh = async () => {
      if (!alive) return;
      setPending(await pendingCount());
      setHasPack(!!(await packInfo()));
    };
    refresh();
    // Silent auto-download: bank arrives in small pages with pauses between
    // them, so the UI stays smooth. One 2s toast reports completion.
    ensurePack(
      (skip, limit) => fetchQuestions({ skip, limit }),
      () => fetchQuestionsCount().then((r) => r.count)
    ).then((res) => {
      if (!alive) return;
      if (res === 'downloaded') {
        refresh();
        toast.success('Offline pack ready — practice works without internet');
      }
    }).catch(() => {});
    const onOnline = async () => {
      setOnline(true);
      await trySync();
    };
    const onOffline = () => {
      setOnline(false);
      toast('You are offline — practicing from the downloaded pack', { duration: 2000 });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const t = setInterval(() => {
      refresh();
      trySync();
    }, 30000);
    return () => {
      alive = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(t);
    };
  }, []);

  if (online && pending === 0) return null;
  const doSyncNow = async () => {
    try {
      const n = await syncOutbox(submitQuiz, clearWrongQueue);
      if (n > 0) toast.success(`Synced ${n} offline quiz${n > 1 ? 'zes' : ''}`);
      setPending(await pendingCount());
    } catch {
      toast.error('Sync failed — will retry automatically.');
    }
  };
  return (
    <div
      role="status"
      onClick={() => {
        if (online && pending > 0) doSyncNow();
      }}
      title={online && pending > 0 ? 'Tap to sync now' : undefined}
      style={{
        position: 'fixed',
        bottom: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99990,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 16px',
        borderRadius: 999,
        fontSize: '0.78rem',
        fontWeight: 600,
        background: online ? 'hsl(var(--primary))' : '#1c1917',
        color: '#fff',
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        whiteSpace: 'nowrap',
        cursor: online && pending > 0 ? 'pointer' : 'default',
      }}
    >
      <span aria-hidden="true">{online ? '🔄' : '📴'}</span>
      {!online && (hasPack ? 'Offline — practicing from downloaded pack' : 'Offline — connect to download practice pack')}
      {online && pending > 0 && `Syncing ${pending} offline result${pending > 1 ? 's' : ''}… tap to retry`}
    </div>
  );
};

export default OfflineBanner;
