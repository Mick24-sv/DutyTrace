import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Folder, Trash2, X } from 'lucide-react';
import './delete-project.css';

export default function DeleteProjectDialog({ open, projectName, onCancel, onConfirm, busy = false }) {
  const ref = useRef(null);
  const shake = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) { setError(''); dialog.showModal(); }
    if (!open && dialog.open) dialog.close();
    return () => { shake.current?.cancel(); };
  }, [open]);

  function nudge(event) {
    if (event.target !== event.currentTarget) return;
    const rect = ref.current.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    shake.current?.cancel();
    shake.current = ref.current.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
      { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' },
      { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
    ], { duration: 380, easing: 'ease-in-out', composite: 'add' });
  }

  async function confirm() {
    setError('');
    try { await onConfirm(); }
    catch { setError('The project could not be deleted. Please try again.'); }
  }

  return (
    <dialog ref={ref} className="delete-project-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onClick={nudge} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
      <div className="delete-project-content">
        <button className="delete-project-close" aria-label="Close confirmation" onClick={onCancel} disabled={busy}><X size={18} /></button>
        <div className="delete-project-icon"><Trash2 size={25} strokeWidth={1.6} /></div>
        <p className="delete-project-eyebrow">PROJECT SETTINGS</p>
        <h2 id={titleId}>Delete this project?</h2>
        <p id={descriptionId} className="delete-project-description">This will permanently delete your project and all of its data. This action cannot be undone.</p>
        <div className="delete-project-summary"><span className="delete-project-folder"><Folder size={19} /></span><div><strong>{projectName}</strong><span>Project and all associated files</span></div></div>
        <p className="delete-project-note"><span aria-hidden="true">!</span> Everything in this project will be gone forever.</p>
        {error && <p role="alert" className="delete-project-error">{error}</p>}
        <div className="delete-project-actions">
          <button autoFocus className="delete-project-cancel" onClick={onCancel} disabled={busy}>Keep project</button>
          <button className="delete-project-confirm" onClick={confirm} disabled={busy}><Trash2 size={16} />{busy ? 'Deleting…' : 'Delete project'}</button>
        </div>
      </div>
      <div className="delete-project-footer"><span aria-hidden="true">↳</span> A little caution goes a long way.</div>
    </dialog>
  );
}

export function ProjectSettingsPreview() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return (
    <main className="project-preview">
      <nav className="project-preview-nav"><span className="project-preview-brand"><span>◈</span> workspace</span><span>My workspace <span className="project-preview-slash">/</span> Project settings</span><span className="project-preview-avatar">JD</span></nav>
      <div className="project-preview-body">
        <a className="project-preview-back" href="/">← Back to workspace</a>
        <div className="project-preview-heading"><div><p className="delete-project-eyebrow">YOUR WORKSPACE, YOUR WAY</p><h1>Project settings</h1><p>Manage the details and preferences for your project.</p></div><span className="project-preview-tag">Personal project <ArrowUpRight size={14} /></span></div>
        <div className="project-preview-tabs"><span>General</span><span>Members</span><span>Integrations</span><span>Activity</span></div>
        {deleted ? <div className="project-preview-panel" role="status"><h2>Project deleted</h2><p>The preview project has been removed.</p><button className="delete-project-cancel" onClick={() => setDeleted(false)}>Reset preview</button></div> : <>
          <section className="project-preview-panel"><h2>Project details</h2><p>A few details to help everyone find their way.</p><label>Project name<input readOnly value="Website redesign" /></label><label>Description<textarea readOnly value="A fresh start for our corner of the internet." /></label><div className="project-preview-saved">All changes saved</div></section>
          <section className="project-preview-danger"><div><h2>Delete project</h2><p>Permanently remove this project and all of its contents.</p></div><button onClick={() => setOpen(true)}><Trash2 size={15} />Delete project</button></section>
        </>}
        <footer className="project-preview-bottom">Made for work that matters.<span>Workspace / Settings</span></footer>
      </div>
      <DeleteProjectDialog open={open} projectName="Website redesign" onCancel={() => setOpen(false)} onConfirm={() => { setDeleted(true); setOpen(false); }} />
    </main>
  );
}
