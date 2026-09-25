import { AuthProvider } from './auth/AuthProvider.js';
import { useAuth } from './auth/context.js';
import { LoginScreen } from './auth/LoginScreen.js';
import { labels } from './labels.js';
import { AppShell } from './shell/AppShell.js';

export function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { state } = useAuth();
  switch (state.status) {
    case 'loading':
      return (
        <main className="flex min-h-dvh items-center justify-center bg-slate-50">
          <p className="text-slate-600">{labels.loading}</p>
        </main>
      );
    case 'anonymous':
      return <LoginScreen notice={state.notice} resume={state.resume} />;
    case 'authenticated':
      return <AppShell me={state.me} />;
  }
}
