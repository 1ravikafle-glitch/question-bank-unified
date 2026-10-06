import { useState, useEffect, useMemo } from 'react';
import { uploadQuestionBankDocx, fetchQuestions, fetchQuestionsCount, fetchCategories, updateQuestion, fetchAdminCategories, renameCategory, deleteCategory, fetchCategoryMeta, setCategoryEmoji, fetchAdminUsers, fetchAdminUserProgress, deleteAdminUser, fetchAdminReferences, addReference, updateReference, deleteReference, fetchAdminContributors, addContributor, updateContributor, deleteContributor, fetchAdminFeedback, replyFeedback } from '../services/api';
import { toast } from 'react-hot-toast';
import { type Question } from '@/shared/types';
import { sortCategories } from '@/utils/categorySort';
import { motion } from 'framer-motion';
import AdminReviewQueue from './AdminReviewQueue';
import ReferencesManager from './ReferencesManager';
import ContributorsManager from './ContributorsManager';
import FeedbackInbox from './FeedbackInbox';

interface FileResult {
  filename: string;
  category?: string;
  questions_found?: number;
  imported?: number;
  skipped_duplicate?: number;
  skipped_no_answer_key?: number;
  error?: string;
}

const EDIT_PAGE_SIZE = 15;

// Fetch EVERY question by paging until a short page.
//
// The list used to be one call with a hardcoded limit: 1000, so with ~3,300
// questions the admin page silently showed only the first thousand and its
// search box could only find within those. The count endpoint kept reporting
// the true total, which is why "not all questions" looked like a database
// problem. Paging keeps the payload per request reasonable and never
// truncates. Do not revert to a single hardcoded limit.
const fetchAllQuestions = async (): Promise<Question[]> => {
  const PAGE = 1000;
  const out: Question[] = [];
  for (let i = 0; i < 50; i++) {
    const page = await fetchQuestions({ skip: out.length, limit: PAGE });
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
};

const AdminUpload: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('');
  const [uploadEmoji, setUploadEmoji] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [showFormatHelp, setShowFormatHelp] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [totalCount, setTotalCount] = useState(0);
  const [totalCategories, setTotalCategories] = useState(0);

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [manageLoading, setManageLoading] = useState(true);
  const [manageSearch, setManageSearch] = useState('');
  const [manageCategory, setManageCategory] = useState('');
  const [managePage, setManagePage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    question_text: string;
    options: Record<string, string>;
    correct_answer: string;
    category: string;
  } | null>(null);
  const [editEmoji, setEditEmoji] = useState('');
  const [saving, setSaving] = useState(false);

  const [adminCategories, setAdminCategories] = useState<{ name: string; count: number }[]>([]);
  const [emojiMeta, setEmojiMeta] = useState<Record<string, string>>({});
  const [emojiDraft, setEmojiDraft] = useState<Record<string, string>>({});
  const [savingEmoji, setSavingEmoji] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [adminUsers, setAdminUsers] = useState<{ id: number; username: string; created_at: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userProgress, setUserProgress] = useState<any>(null);
  const [userProgressLoading, setUserProgressLoading] = useState(false);

  const emptyOptions = { a: '', b: '', c: '', d: '' };

  const loadManageData = async () => {
    setManageLoading(true);
    try {
      const [cats, qsRaw, countData, adminCats] = await Promise.all([
        fetchCategories(),
        fetchAllQuestions(),
        fetchQuestionsCount({}),
        fetchAdminCategories(),
      ]);
      const qs = qsRaw.map((q) => {
        const rawOpts = q.options;
        let parsedOpts = {};
        if (typeof rawOpts === 'string') {
          try { parsedOpts = JSON.parse(rawOpts); } catch { parsedOpts = {}; }
        } else if (rawOpts && typeof rawOpts === 'object') {
          parsedOpts = rawOpts;
        }
        return { ...q, options: parsedOpts };
      });
      setCategories(sortCategories(cats));
      setAllQuestions(qs);
      setTotalCount(countData.count);
      setTotalCategories(cats.length);
      setAdminCategories(adminCats.sort((a, b) => b.count - a.count));
      fetchCategoryMeta().then(setEmojiMeta).catch(() => {});
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error('Could not load the question list.');
    } finally {
      setManageLoading(false);
    }
  };

  useEffect(() => { loadManageData(); }, []);

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const users = await fetchAdminUsers();
        setAdminUsers(users);
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.docx'));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) { toast.error('Choose at least one .docx file first'); return; }
    setUploading(true);
    setResults(null);
    try {
      const data = await uploadQuestionBankDocx(files, category || undefined);
      setResults(data.files);
      toast.success(`Imported ${data.total_imported} new questions`);
      // Apply the chosen emoji to the upload category (new or existing)
      const catName = category.trim();
      const em = uploadEmoji.trim();
      if (catName && em) {
        try {
          await setCategoryEmoji(catName, em);
          const m = await fetchCategoryMeta();
          setEmojiMeta(m);
        } catch {}
      }
      loadManageData();
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error?.response?.data?.detail ? JSON.stringify(error.response.data.detail) : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const filteredForManage = useMemo(() => {
    let list = allQuestions;
    if (manageCategory) list = list.filter(q => q.category === manageCategory);
    if (manageSearch.trim()) {
      const s = manageSearch.toLowerCase();
      list = list.filter(q => q.question_text.toLowerCase().includes(s));
    }
    return list;
  }, [allQuestions, manageCategory, manageSearch]);

  useEffect(() => { setManagePage(1); }, [manageSearch, manageCategory]);

  const totalManagePages = Math.max(1, Math.ceil(filteredForManage.length / EDIT_PAGE_SIZE));
  const managePageItems = filteredForManage.slice((managePage - 1) * EDIT_PAGE_SIZE, managePage * EDIT_PAGE_SIZE);
  const startIdx = (managePage - 1) * EDIT_PAGE_SIZE + 1;
  const endIdx = Math.min(managePage * EDIT_PAGE_SIZE, filteredForManage.length);

  const startEdit = (q: Question) => {
    setEditEmoji(emojiMeta[q.category || ''] || '');
    const rawOpts = q.options;
    let parsedOpts = {};
    if (typeof rawOpts === 'string') {
      try { parsedOpts = JSON.parse(rawOpts); } catch { parsedOpts = {}; }
    } else if (rawOpts && typeof rawOpts === 'object') {
      parsedOpts = rawOpts;
    }
    setEditingId(q.id);
    setEditForm({
      question_text: q.question_text,
      options: { ...emptyOptions, ...parsedOpts },
      correct_answer: (q.correct_answer || 'a').toLowerCase(),
      category: q.category || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async (id: number) => {
    if (!editForm) return;
    if (!editForm.question_text.trim()) { toast.error('Question text cannot be empty'); return; }
    const cleanedOptions = Object.fromEntries(Object.entries(editForm.options).filter(([, v]) => v.trim() !== ''));
    if (Object.keys(cleanedOptions).length > 0 && !cleanedOptions[editForm.correct_answer]) {
      toast.error('Correct answer must match one of the filled-in options');
      return;
    }
    setSaving(true);
    try {
      try {
        const { invalidateBankEdits } = await import('@/utils/snapshotInvalidation');
        invalidateBankEdits();
      } catch { /* snapshots refresh next visit */ }
      const updated = await updateQuestion(id, {
        question_text: editForm.question_text.trim(),
        options: cleanedOptions,
        correct_answer: editForm.correct_answer,
        category: editForm.category.trim() || undefined,
      });
      setAllQuestions(prev => prev.map(q => (q.id === id ? { ...q, ...updated } : q)));
      toast.success('Question updated');
      const editCat = editForm.category.trim();
      const editEm = (editEmoji || '').trim();
      if (editCat && editEm) {
        try {
          await setCategoryEmoji(editCat, editEm);
          const m = await fetchCategoryMeta();
          setEmojiMeta(m);
        } catch {}
      }
      cancelEdit();
    } catch (error) {
      console.error('Error saving question:', error);
      toast.error('Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { toast.error('New category name cannot be empty.'); return; }
    if (trimmed === oldName) { setRenamingCategory(null); return; }
    setRenaming(true);
    try {
      try {
        const { invalidateBankEdits } = await import('@/utils/snapshotInvalidation');
        invalidateBankEdits();
      } catch { /* snapshots refresh next visit */ }
      await renameCategory(oldName, trimmed);
      toast.success(`Renamed "${oldName}" to "${trimmed}"`);
      setRenamingCategory(null);
      setRenameValue('');
      loadManageData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to rename category.');
    } finally {
      setRenaming(false);
    }
  };

  const handleSaveEmoji = async (categoryName: string) => {
    const v = (emojiDraft[categoryName] ?? '').trim();
    setSavingEmoji(categoryName);
    try {
      await setCategoryEmoji(categoryName, v);
      const m = await fetchCategoryMeta();
      setEmojiMeta(m);
      setEmojiDraft((d) => ({ ...d, [categoryName]: '' }));
      toast.success(v ? `Emoji set for "${categoryName}"` : `Emoji cleared for "${categoryName}"`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save emoji.');
    } finally {
      setSavingEmoji(null);
    }
  };

  const handleDeleteCategory = async (categoryName: string) => {
    if (!window.confirm(`Are you sure you want to delete the category "${categoryName}"?\nThis will permanently delete all ${adminCategories.find(cat => cat.name === categoryName)?.count || 0} questions in this category.`)) return;
    setDeletingCategory(categoryName);
    setDeleting(true);
    try {
      try {
        const { invalidateBankEdits } = await import('@/utils/snapshotInvalidation');
        invalidateBankEdits();
      } catch { /* snapshots refresh next visit */ }
      const result = await deleteCategory(categoryName);
      toast.success(`Deleted category "${categoryName}" and ${result.questions_deleted || 0} questions`);
      loadManageData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete category.');
    } finally {
      setDeletingCategory(null);
      setDeleting(false);
    }
  };

  const handleViewUserProgress = async (username: string) => {
    if (selectedUser === username) { setSelectedUser(null); setUserProgress(null); return; }
    setSelectedUser(username);
    setUserProgressLoading(true);
    try {
      const progress = await fetchAdminUserProgress(username);
      setUserProgress(progress);
    } catch (error) {
      toast.error('Could not load user progress.');
    } finally {
      setUserProgressLoading(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!window.confirm(`Delete user "${username}" and ALL their data? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(username);
      toast.success(`User "${username}" deleted`);
      setAdminUsers(prev => prev.filter(u => u.username !== username));
      if (selectedUser === username) { setSelectedUser(null); setUserProgress(null); }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete user.');
    }
  };

  return (
    <motion.div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >

      {/* Contributor submissions awaiting a decision. Approving here is the
          only way their questions reach the question bank. */}
      <AdminReviewQueue />

      {/* Header */}
      <div>
        <div style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))', marginBottom: '0.75rem' }}>
          Admin
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-5xl font-bold" color="hsl(var(--foreground))">
          Question Bank
        </h1>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>
          Manage and import your forestry MCQ question bank.
        </p>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid">
        <div className="stat-tile">
          <span className="stat-tile-value" style={{ color: 'hsl(var(--primary))' }}>{totalCount.toLocaleString()}</span>
          <span className="stat-tile-label">Questions</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-value" style={{ color: 'hsl(var(--primary))' }}>{totalCategories}</span>
          <span className="stat-tile-label">Categories</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-value" style={{ color: 'hsl(var(--primary))' }}>{totalManagePages}</span>
          <span className="stat-tile-label">Pages</span>
        </div>
      </div>

      {/* Two-column layout: Upload left, Category Management right */}
      <div className="admin-two-col">

        {/* Left column: Import */}
        <div className="space-y-4">
          <div className="card" style={{ padding: '0.9rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>Import Question Bank</h2>
            <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1.25rem' }}>Upload DOCX question sets to add questions.</p>

            {/* Drop zone */}
            <div
              style={{
                border: '2px dashed',
                borderColor: dragOver ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                background: dragOver ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--muted) / 0.3)',
                borderRadius: 'var(--apple-radius-lg)',
                padding: '2.5rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 150ms',
                marginBottom: '1rem',
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('docxFiles')?.click()}
            >
              <input id="docxFiles" type="file" accept=".docx" multiple onChange={handleFileChange} className="hidden" />
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</p>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>
                {dragOver ? 'Drop files here' : 'Drop DOCX files here'}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>or click to browse · .docx</p>
            </div>

            {/* Selected files */}
            {files.length > 0 && (
              <div className="space-y-2" style={{ marginBottom: '1rem' }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '0.875rem' }}>📄</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button onClick={() => removeFile(i)} className="btn btn-ghost btn-sm" style={{ color: 'hsl(var(--destructive))', padding: '4px 8px', fontSize: '0.75rem' }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Category + emoji */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '0.375rem' }}>
                Category (optional)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Guessed from filename if left blank"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{ fontSize: '1.1rem' }} title={category.trim() ? `Current emoji: ${emojiMeta[category.trim()] || 'none yet'}` : 'Type a category first'}>
                  {category.trim() ? (emojiMeta[category.trim()] || '🏷️') : '🏷️'}
                </span>
                <input
                  type="text"
                  value={uploadEmoji}
                  onChange={(e) => setUploadEmoji(e.target.value)}
                  placeholder="😀"
                  title="Emoji for this category (applied on import)"
                  maxLength={8}
                  className="input"
                  style={{ width: '3.5rem', textAlign: 'center' }}
                />
              </div>
            </div>
            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button onClick={handleUpload} disabled={uploading || files.length === 0} className="btn btn-primary">
                {uploading ? 'Uploading…' : 'Upload & Import'}
              </button>
              <button onClick={() => setShowFormatHelp(!showFormatHelp)} className="btn btn-ghost btn-sm" style={{ color: 'hsl(var(--primary))' }}>
                {showFormatHelp ? 'Hide guide' : 'Format guide'}
              </button>
            </div>

            {/* Format help */}
            {showFormatHelp && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.5)', border: '1px solid hsl(var(--border))' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '0.5rem' }}>Expected DOCX format:</p>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'hsl(var(--foreground))', margin: 0 }}>
{`Questions:
1. Question text...

Options:
a] option text
b] option text
c] option text
d] option text

Answer key:
1a 2b 3c 4d ...`}
                </pre>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>Re-uploading the same file is safe. Duplicates are skipped.</p>
              </div>
            )}
          </div>

          {/* Import results */}
          {results && (
            <div className="card" style={{ padding: '0.75rem', borderLeft: '3px solid hsl(var(--success))' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ color: 'hsl(var(--success))' }}>✓</span> Import Complete
              </p>
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i} style={{ padding: '0.625rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.3)', border: '1px solid hsl(var(--border))' }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>{r.filename}</p>
                    {r.error ? (
                      <p style={{ fontSize: '0.75rem', color: 'hsl(var(--destructive))', marginTop: '0.25rem' }}>{r.error}</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                        <span>{r.category}</span>
                        <span>Found: {r.questions_found}</span>
                        <span style={{ color: 'hsl(var(--success))', fontWeight: 600 }}>Imported: {r.imported}</span>
                        <span>{r.skipped_duplicate} dupes</span>
                        <span>{r.skipped_no_answer_key} missing key</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>


          {/* User Management — fills left empty space */}
          <div className="card" style={{ padding: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>User Management</h2>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>View registered users and their progress.</p>

            {usersLoading ? (
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading users…</p>
            ) : adminUsers.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>No users found.</p>
            ) : (
              <div className="space-y-2">
                {adminUsers.map((user) => (
                  <div key={user.id} style={{ borderRadius: 'var(--apple-radius-md)', border: '1px solid hsl(var(--border))', background: selectedUser === user.username ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--card))', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span style={{ width: '2rem', height: '2rem', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>{user.username}</p>
                          <p style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))' }}>Joined {new Date(user.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button onClick={() => handleViewUserProgress(user.username)} className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.6875rem' }}>
                          {selectedUser === user.username ? 'Close' : 'Progress'}
                        </button>
                        <button onClick={() => handleDeleteUser(user.username)} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '0.6875rem', color: 'hsl(var(--destructive))' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {selectedUser === user.username && userProgress && (
                      <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid hsl(var(--border))' }}>
                        {userProgressLoading ? (
                          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', padding: '0.5rem 0' }}>Loading…</p>
                        ) : (
                          <div className="space-y-3" style={{ paddingTop: '0.75rem' }}>
                            <div className="admin-user-stats">
                              {[
                                { label: 'Attempts', value: userProgress.total_attempts },
                                { label: 'Questions', value: userProgress.total_attempted },
                                { label: 'Correct', value: userProgress.total_correct },
                                { label: 'Accuracy', value: `${userProgress.accuracy}%` },
                              ].map((s) => (
                                <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.5)' }}>
                                  <p style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'hsl(var(--primary))' }}>{s.value}</p>
                                  <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>{s.label}</p>
                                </div>
                              ))}
                            </div>
                            {userProgress.recent_attempts?.length > 0 && (
                              <div>
                                <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.375rem' }}>Recent</p>
                                <div className="space-y-1">
                                  {userProgress.recent_attempts.slice(0, 5).map((a: any) => (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', padding: '4px 8px', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.3)' }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>#{a.id}</span>
                                      <span style={{ fontWeight: 500 }}>{a.score}/{a.total_questions}</span>
                                      <span style={{ fontWeight: 700, color: a.percentage >= 80 ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>{a.percentage}%</span>
                                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{new Date(a.completed_at).toLocaleDateString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Category Management */}
        <div>
          {/* Category Management */}
          <div className="card" style={{ padding: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>Category Management</h2>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>Rename or delete categories across the bank.</p>

            {adminCategories.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>No categories found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {adminCategories.map((cat, i) => (
                  <div key={cat.name} style={{ borderTop: i > 0 ? '1px solid hsl(var(--border))' : undefined, padding: '0.75rem 0' }}>
                    {renamingCategory === cat.name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCategory(cat.name); if (e.key === 'Escape') { setRenamingCategory(null); setRenameValue(''); } }}
                          autoFocus
                          className="input"
                          style={{ flex: 1, maxWidth: '16rem', padding: '6px 10px', fontSize: '0.8125rem' }}
                        />
                        <button onClick={() => handleRenameCategory(cat.name)} disabled={renaming} className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>
                          {renaming ? '…' : 'Save'}
                        </button>
                        <button onClick={() => { setRenamingCategory(null); setRenameValue(''); }} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px', fontSize: '0.75rem' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1rem', width: '1.75rem', textAlign: 'center', flexShrink: 0 }} title="Current emoji">{emojiMeta[cat.name] || '🏷️'}</span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                        <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>{cat.count}</span>
                        <input
                          type="text"
                          value={emojiDraft[cat.name] ?? ''}
                          onChange={(e) => setEmojiDraft((d) => ({ ...d, [cat.name]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEmoji(cat.name); }}
                          placeholder="😀"
                          title="Set category emoji (leave empty to clear)"
                          maxLength={8}
                          className="input"
                          style={{ width: '3rem', padding: '4px 6px', fontSize: '0.8125rem', textAlign: 'center' }}
                        />
                        <button onClick={() => handleSaveEmoji(cat.name)} disabled={savingEmoji === cat.name} className="btn btn-outline btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem' }}>{savingEmoji === cat.name ? '…' : 'Set'}</button>
                        <button onClick={() => { setRenamingCategory(cat.name); setRenameValue(cat.name); }} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--primary))' }}>Rename</button>
                        <button onClick={() => handleDeleteCategory(cat.name)} disabled={deleting} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--destructive))' }}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* Question Management */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>Question Management</h2>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>Review and correct imported questions.</p>

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '16rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))', pointerEvents: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search questions…"
              value={manageSearch}
              onChange={(e) => setManageSearch(e.target.value)}
              className="input"
              style={{ paddingLeft: '2rem', width: '100%' }}
            />
          </div>
          <select value={manageCategory} onChange={(e) => setManageCategory(e.target.value)} className="input" style={{ width: '12rem' }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>
          {filteredForManage.length > 0 ? `${startIdx}–${endIdx}` : '0'} of {filteredForManage.length.toLocaleString()}
        </p>

        {manageLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton" style={{ height: '3rem', borderRadius: 'var(--apple-radius-md)' }} />
            ))}
          </div>
        ) : managePageItems.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No questions found</p>
            <p className="empty-state-description">Try changing the search term or category filter.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {managePageItems.map(q => (
              <div key={q.id} style={{ borderRadius: 'var(--apple-radius-md)', border: '1px solid hsl(var(--border))', background: editingId === q.id ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--card))' }}>
                {editingId === q.id && editForm ? (
                  <div style={{ padding: '1rem' }} className="space-y-3">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>EDIT #{q.question_number}</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={cancelEdit} disabled={saving} className="btn btn-ghost btn-sm">Cancel</button>
                        <button onClick={() => saveEdit(q.id)} disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '4px' }}>Question</label>
                      <textarea value={editForm.question_text} onChange={(e) => setEditForm({ ...editForm, question_text: e.target.value })} className="input" style={{ width: '100%', minHeight: '4rem', resize: 'vertical' }} />
                    </div>
                    <div className="admin-opt-grid">
                      {(['a', 'b', 'c', 'd'] as const).map(key => (
                        <div key={key}>
                          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '4px' }}>Option {key.toUpperCase()}</label>
                          <input type="text" value={editForm.options[key] || ''} onChange={(e) => setEditForm({ ...editForm, options: { ...editForm.options, [key]: e.target.value } })} className="input" style={{ width: '100%' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '4px' }}>Answer</label>
                        <select value={editForm.correct_answer} onChange={(e) => setEditForm({ ...editForm, correct_answer: e.target.value })} className="input" style={{ width: '5rem' }}>
                          {(['a', 'b', 'c', 'd'] as const).map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '4px' }}>Category + emoji</label>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <input type="text" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="input" style={{ flex: 1, minWidth: 0 }} />
                          <input type="text" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} placeholder="😀" title="Emoji for this category (saved with the question)" maxLength={8} className="input" style={{ width: '3rem', textAlign: 'center', flexShrink: 0 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', transition: 'background 150ms', cursor: 'default' }} className="hover:bg-muted/20">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', width: '3rem', flexShrink: 0 }}>
                      #{String(q.question_number).padStart(3, '0')}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.question_text}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                        <span className="chip" style={{ fontSize: '0.625rem', padding: '2px 6px' }}>{q.category || 'Uncategorized'}</span>
                        <span style={{ fontSize: '0.625rem', color: 'hsl(var(--muted-foreground))' }}>{Object.keys(q.options || {}).length} opts</span>
                        <span style={{ fontSize: '0.625rem', color: 'hsl(var(--muted-foreground))' }}>Ans: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{q.correct_answer || '—'}</span></span>
                      </div>
                    </div>
                    <button onClick={() => startEdit(q)} className="btn btn-outline btn-sm" style={{ flexShrink: 0, padding: '4px 12px', fontSize: '0.6875rem' }}>Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalManagePages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', paddingTop: '1rem' }}>
            <button onClick={() => setManagePage(p => Math.max(1, p - 1))} disabled={managePage === 1} className="btn btn-outline btn-sm" style={{ opacity: managePage === 1 ? 0.4 : 1, cursor: managePage === 1 ? 'not-allowed' : 'pointer' }}>
              ← Prev
            </button>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>
              {managePage} / {totalManagePages}
            </span>
            <button onClick={() => setManagePage(p => Math.min(totalManagePages, p + 1))} disabled={managePage === totalManagePages} className="btn btn-outline btn-sm" style={{ opacity: managePage === totalManagePages ? 0.4 : 1, cursor: managePage === totalManagePages ? 'not-allowed' : 'pointer' }}>
              Next →
            </button>
          </div>
        )}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ReferencesManager
          list={fetchAdminReferences}
          add={addReference}
          update={updateReference}
          remove={deleteReference}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ContributorsManager
          list={fetchAdminContributors}
          add={addContributor}
          update={updateContributor}
          remove={deleteContributor}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <FeedbackInbox list={fetchAdminFeedback} reply={replyFeedback} />
      </div>
    </motion.div>
  );
};

export default AdminUpload;
