import type { AuthUserDirectory } from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import type { ResumeHint } from './context.js';
import { PasswordLogin } from './PasswordLogin.js';
import { PinLogin } from './PinLogin.js';

type Directory =
  | { status: 'loading' }
  | { status: 'lan'; users: AuthUserDirectory['users'] }
  | { status: 'remote' }
  | { status: 'error'; message: string };

interface LoginScreenProps {
  /** Why the user is here (idle lock, expired session…), if not a plain start. */
  notice: string | null;
  resume: ResumeHint | null;
}

/**
 * In the shop, the user directory answers: names to tap, then a PIN (RG-USR-03), password
 * on request. Outside, it answers AUTH_LAN_ONLY: password + TOTP for owner/admin (RG-USR-04).
 */
export function LoginScreen({ notice, resume }: LoginScreenProps) {
  const [directory, setDirectory] = useState<Directory>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [passwordMode, setPasswordMode] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authApi.users(controller.signal).then(
      ({ users }) => setDirectory({ status: 'lan', users }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setDirectory(
          error instanceof ApiError && error.code === 'AUTH_LAN_ONLY'
            ? { status: 'remote' }
            : { status: 'error', message: errorMessage(error) },
        );
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setDirectory({ status: 'loading' });
    setAttempt((count) => count + 1);
  };

  let content;
  switch (directory.status) {
    case 'loading':
      content = <p className="text-slate-600">{labels.loading}</p>;
      break;
    case 'error':
      content = (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {directory.message}
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-12 rounded-xl bg-teal-700 px-6 text-lg font-semibold text-white"
          >
            {labels.retry}
          </button>
        </div>
      );
      break;
    case 'remote':
      content = <PasswordLogin remote />;
      break;
    case 'lan':
      content =
        directory.users.length === 0 ? (
          <PasswordLogin remote={false} intro={labels.login.noPinUsers} />
        ) : passwordMode ? (
          <PasswordLogin remote={false} onPinMode={() => setPasswordMode(false)} />
        ) : (
          <PinLogin
            users={directory.users}
            resume={resume}
            onPasswordMode={() => setPasswordMode(true)}
          />
        );
      break;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-slate-50 px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-teal-700">{labels.appName}</h1>
        <p className="text-slate-600">{labels.tagline}</p>
      </header>
      <section className="flex w-full max-w-4xl flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        {notice && (
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">
            {notice}
          </p>
        )}
        {content}
      </section>
    </main>
  );
}
