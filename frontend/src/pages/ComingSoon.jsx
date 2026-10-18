import EmptyState from '../components/ui/EmptyState.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Badge from '../components/ui/Badge.jsx';

// Honest placeholder: clearly says the feature is not built yet and when it is planned.
export default function ComingSoon({ label, phase, icon }) {
  return (
    <>
      <PageHeader title={label}>
        <Badge tone="info">{phase ? `Planned: Phase ${phase}` : 'Planned: not yet scheduled'}</Badge>
      </PageHeader>
      <EmptyState icon={icon} title="Not built yet">
        This page is a placeholder. {label} {phase ? `will be implemented in Phase ${phase} of the development plan.` : 'is not scheduled in the current development plan.'} Nothing on this page is functional.
      </EmptyState>
    </>
  );
}
