import type { RegisterSession } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';

interface SessionState {
  session: RegisterSession | null;
  /** The answer came: no session means the register is to be opened. */
  loaded: boolean;
  error: string | null;
}

/** The cashier's open register session (RG-CAI-02, H32), read once, replaced on opening. */
export function useRegisterSession() {
  const [state, setState] = useState<SessionState>({ session: null, loaded: false, error: null });
  useEffect(() => {
    let live = true;
    paymentsApi.currentSession().then(
      (session) => live && setState({ session, loaded: true, error: null }),
      (failure: unknown) =>
        live && setState({ session: null, loaded: true, error: errorMessage(failure) }),
    );
    return () => {
      live = false;
    };
  }, []);
  const opened = useCallback((session: RegisterSession) => {
    setState({ session, loaded: true, error: null });
  }, []);
  const closed = useCallback(() => {
    setState({ session: null, loaded: true, error: null });
  }, []);
  return { ...state, opened, closed };
}
