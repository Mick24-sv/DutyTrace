import {Children} from 'react';
export default function PageHeader({ title, description, children, icon: Icon }) {
  const actions=Children.toArray(children);
  return (
    <div data-tutorial="page-header" className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-start gap-2 text-xl font-semibold">{Icon&&<Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-teal"/>}<span className="min-w-0 break-words">{title}</span></h1>
        {description && <p className="mt-1 break-words text-sm text-muted">{description}</p>}
      </div>
      {actions.length>0&&<div className="flex w-full min-w-0 flex-col items-start gap-2 sm:ml-auto sm:w-auto sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>}
    </div>
  );
}
