import type { AuthUserDirectory } from '@vente-web/shared';
import { useEffect, useState, type ReactNode } from 'react';

import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
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

  // The bottom band says what to do here; a notice (idle lock, expired session) takes its place.
  let content;
  let instruction: string | null = labels.login.instruction;
  switch (directory.status) {
    case 'loading':
      content = <p className="m-auto text-18 text-ink-2">{labels.loading}</p>;
      break;
    case 'error':
      instruction = null;
      content = (
        <div
          className={`${sheetClass} m-auto flex w-full max-w-md flex-col items-center gap-4 p-6`}
        >
          <p
            role="alert"
            className="flex w-full items-start gap-2 rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
          >
            <Icon name="alert" className="size-5 translate-y-px" />
            {directory.message}
          </p>
          <button type="button" onClick={retry} className={buttonClass('primary', 'lg', 'px-8')}>
            {labels.retry}
          </button>
        </div>
      );
      break;
    case 'remote':
      instruction = labels.login.passwordInstruction;
      content = (
        <PasswordSheet>
          <PasswordLogin remote />
        </PasswordSheet>
      );
      break;
    case 'lan':
      if (directory.users.length === 0 || passwordMode) {
        instruction = labels.login.passwordInstruction;
        content = (
          <PasswordSheet>
            {directory.users.length === 0 ? (
              <PasswordLogin remote={false} intro={labels.login.noPinUsers} />
            ) : (
              <PasswordLogin remote={false} onPinMode={() => setPasswordMode(false)} />
            )}
          </PasswordSheet>
        );
      } else {
        content = (
          <PinLogin
            users={directory.users}
            resume={resume}
            onPasswordMode={() => setPasswordMode(true)}
          />
        );
      }
      break;
  }

  return (
    <Frame
      workspace="login"
      name={labels.login.title}
      wordmarkHeading
      note={notice ?? instruction}
      {...(notice ? { noteIcon: 'lock' as const } : {})}
    >
      {content}
    </Frame>
  );
}

/** The password form sits in one white sheet, centred in the field. */
function PasswordSheet({ children }: { children: ReactNode }) {
  return (
    <div className={`${sheetClass} mx-auto my-auto w-full max-w-xl p-5 sm:p-6`}>{children}</div>
  );
}
