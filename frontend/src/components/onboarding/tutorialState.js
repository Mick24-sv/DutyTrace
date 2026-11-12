export function tutorialInitialState(progress, stepCount) {
  const valid = progress && ['in_progress', 'completed', 'dismissed'].includes(progress.status);
  return {
    stepIndex: valid && Number.isInteger(progress.stepIndex) ? Math.max(0, Math.min(stepCount - 1, progress.stepIndex)) : 0,
    open: !valid || progress.status === 'in_progress',
  };
}
