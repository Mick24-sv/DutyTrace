import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function NotFound({ base = '/' }) {
  return (
    <EmptyState icon={SearchX} title="Page not found">
      <p>That page doesn't exist.</p>
      <Link to={base} className="mt-3 inline-block font-medium text-teal underline">
        Back to dashboard
      </Link>
    </EmptyState>
  );
}
