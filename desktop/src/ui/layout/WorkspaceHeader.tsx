import { DesktopToolbar } from './DesktopToolbar';
import logo from '../../assets/edorax.svg';
import { ThemeToggle } from './ThemeToggle';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { AccountMenu } from '../auth/AccountMenu';
import { NotificationsBell } from '../notifications/NotificationsBell';
import type { Session } from '../auth/useSession';

export function WorkspaceHeader({
  selected,
  courseTitle,
  backToCourses,
  session,
}: {
  selected: boolean;
  courseTitle?: string;
  backToCourses: () => void;
  session: Session;
}) {
  const { authBusy, authError, setAuthError } = session;
  return (
    <>
      <DesktopToolbar>
        {!selected && (
          <div className="flex items-center gap-2.5 select-none">
            <img src={logo} alt="" className="size-7" />
            <span className="font-heading text-base font-bold tracking-tight">edorax</span>
          </div>
        )}
        {selected && (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={backToCourses}
              aria-label="Back to courses"
              title="Back to courses"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
            <p className="truncate select-none text-[13px] font-semibold leading-5">
              {courseTitle || 'Course'}
            </p>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <NotificationsBell />
          <AccountMenu session={session} />
        </div>
      </DesktopToolbar>
      {(authError || authBusy) && (
        <div
          className={`shrink-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-8 py-3 text-xs ${
            authError
              ? 'border-rose-500/20 bg-rose-500/10 text-rose-900 dark:text-rose-200'
              : 'border-border bg-card text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {authError ? (
              <AlertCircle
                size={15}
                className="shrink-0 text-rose-600 dark:text-rose-400"
              />
            ) : (
              <Loader2
                size={15}
                className="shrink-0 animate-spin text-primary"
              />
            )}
            <p role={authError ? 'alert' : 'status'} className="truncate">
              {authError ||
                'Complete sign-in in your browser window, then return here.'}
            </p>
          </div>
          {authBusy ? (
            <button
              onClick={() =>
                void window.buildment
                  .cancelSignIn()
                  .catch(() =>
                    setAuthError('Could not cancel sign-in. Please try again.'),
                  )
              }
              className="font-medium underline underline-offset-4 hover:opacity-80"
            >
              Cancel sign-in
            </button>
          ) : (
            <button
              onClick={() => setAuthError('')}
              className="font-medium underline underline-offset-4 hover:opacity-80"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  );
}
