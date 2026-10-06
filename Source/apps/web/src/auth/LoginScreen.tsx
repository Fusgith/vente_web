import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { sheetClass } from '../ui/button.js';
import type { ResumeHint } from './context.js';
import { PasswordLogin } from './PasswordLogin.js';

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
      </div>
    </Frame>
  );
}
