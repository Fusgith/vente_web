import { formatDate } from '@vente-web/shared';

import { labels } from '../labels.js';
import { trialDaysLeft, useLicense } from '../license/context.js';
import { Frame } from '../shell/Frame.js';
import { sheetClass } from '../ui/button.js';
import type { ResumeHint } from './context.js';
import { PasswordLogin } from './PasswordLogin.js';
import { textLinkClass } from './user-look.js';

interface LoginScreenProps {
  /** Why the user is here (idle lock, expired session…), if not a plain start. */
  notice: string | null;
  resume: ResumeHint | null;
}

/**
 * One form everywhere: identifier and password, and the account opens its own space; no list
 * of names, no PIN, no role to choose (RG-USR-02, RG-USR-03, H57).
 */
export function LoginScreen({ notice, resume }: LoginScreenProps) {
  const license = useLicense();
  const daysLeft = trialDaysLeft(license?.status ?? null);
  const expires = license?.status?.expires;
  return (
    <Frame
      workspace="login"
      name={labels.login.title}
      wordmarkHeading
      note={notice ?? labels.login.instruction}
      {...(notice ? { noteIcon: 'lock' as const } : {})}
    >
      <div className={`${sheetClass} mx-auto my-auto w-full max-w-xl p-5 sm:p-6`}>
        <PasswordLogin initialUsername={resume?.username ?? ''} />
        {daysLeft !== null && expires && (
          // The last days of a trial (H82): the shop asks the vendor for a key in time.
          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-4 text-ink-2">
            {labels.license.endsOn(formatDate(expires), daysLeft)}
            <button type="button" onClick={() => license?.change()} className={textLinkClass}>
              {labels.license.change}
            </button>
          </p>
        )}
      </div>
    </Frame>
  );
}
