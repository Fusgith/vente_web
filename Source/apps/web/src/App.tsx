import { AuthProvider } from './auth/AuthProvider.js';
import { useAuth } from './auth/context.js';
import { LoginScreen } from './auth/LoginScreen.js';
import { labels } from './labels.js';
import { AppShell } from './shell/AppShell.js';
import { Frame } from './shell/Frame.js';

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
        <Frame workspace="login" name={labels.login.title} note={null}>
          <p className="m-auto text-18 text-ink-2">{labels.loading}</p>
        </Frame>
      );
    case 'anonymous':
      return <LoginScreen notice={state.notice} resume={state.resume} />;
    case 'authenticated':
      return <AppShell me={state.me} />;
  }
}
