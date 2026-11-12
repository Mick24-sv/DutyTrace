import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPut } from '../services/api.js';
import { TUTORIALS, TUTORIAL_VERSION } from '../components/onboarding/tutorialContent.js';
import { tutorialInitialState } from '../components/onboarding/tutorialState.js';

function readProgress(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function remember(key, progress) { try { localStorage.setItem(key, JSON.stringify(progress)); } catch { /* The server remains the source of persistence when storage is unavailable. */ } }

export default function useTutorial(user, role) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve());
  const liveKey = useRef(null);
  const finishing = useRef(false);
  const interacted = useRef(false);
  const key = `dutytrace:tutorial:${user?.id}:${role}:v${TUTORIAL_VERSION}`;
  const lastStep = TUTORIALS[role].steps.length - 1;

  useEffect(() => {
    if (!user?.id) return undefined;
    liveKey.current = key;
    interacted.current = false;
    const controller = new AbortController();
    function restore(progress) {
      if (controller.signal.aborted || interacted.current) return;
      const state = tutorialInitialState(progress, lastStep + 1);
      setStepIndex(state.stepIndex);
      setOpen(state.open);
    }
    const timeout = setTimeout(() => { restore(readProgress(key)); controller.abort(); }, 3500);
    apiGet('/auth/tutorial', { signal: controller.signal }).then(result => {
      clearTimeout(timeout);
      if (controller.signal.aborted) return;
      const progress = result.progress ?? readProgress(key);
      if (result.progress) remember(key, result.progress);
      restore(progress);
    }).catch(error => { clearTimeout(timeout); if (error.name !== 'AbortError') restore(readProgress(key)); });
    return () => { clearTimeout(timeout); controller.abort(); if (liveKey.current === key) liveKey.current = null; };
  }, [user?.id, role, key, lastStep]);

  function persist(progress) {
    remember(key, progress);
    const requestKey = key;
    // Serialize saves so a slow previous-step request cannot overwrite Finish.
    const request = queue.current.catch(() => {}).then(() => {
      if (liveKey.current !== requestKey) return;
      return apiPut('/auth/tutorial', progress);
    });
    queue.current = request;
    return request;
  }
  function selectStep(index) {
    interacted.current = true;
    const next = Math.max(0, Math.min(lastStep, index));
    setStepIndex(next);
    void persist({ stepIndex: next, status: 'in_progress' }).catch(() => {});
  }
  function skip() {
    if (finishing.current) return;
    setOpen(false);
    interacted.current = true;
    void persist({ stepIndex, status: 'dismissed' }).catch(() => {});
  }
  async function finish() {
    if (finishing.current) return false;
    finishing.current = true; setSaving(true);
    interacted.current = true;
    let timeout;
    try { await Promise.race([persist({ stepIndex: lastStep, status: 'completed' }), new Promise(resolve => { timeout = setTimeout(resolve, 2500); })]); }
    catch { /* Locally saved completion keeps offline users from being blocked. */ }
    finally { clearTimeout(timeout); finishing.current = false; setSaving(false); setOpen(false); }
    return true;
  }
  function replay() { interacted.current = true; setStepIndex(0); setOpen(true); }
  return { open, stepIndex, saving, selectStep, skip, finish, replay };
}
