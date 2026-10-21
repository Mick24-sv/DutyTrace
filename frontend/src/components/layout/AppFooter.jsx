export default function AppFooter({ context = 'Student Assistant' }) {
  return (
    <footer className="mt-auto border-t border-line bg-surface px-4 py-4 text-xs text-muted sm:px-8 sm:py-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span>© {new Date().getFullYear()} DutyTrace. All rights reserved.</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 sm:justify-end">
          <span>{context}</span>
          <span>Duty hours, verified.</span>
        </div>
      </div>
    </footer>
  );
}
