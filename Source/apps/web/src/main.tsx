import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './fonts.css';
import './index.css';
import { LicenseGate } from './license/LicenseGate.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Every screen, the public ones too, waits for the server's trial license (T-101).
const mount = (node: ReactNode) =>
  createRoot(root).render(
    <StrictMode>
      <LicenseGate>{node}</LicenseGate>
    </StrictMode>,
  );

// The public display, opened by its station key without an account (RG-DSP-03).
const display = /^\/ecran\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
// The self-service kiosk, opened the same way (RG-BOR-01).
const kiosk = /^\/borne\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];

// The design gallery exists only in development: the build drops this branch and its chunk.
if (import.meta.env.DEV && window.location.pathname === '/__design') {
  void import('./dev/DesignGallery.js').then(({ DesignGallery }) => mount(<DesignGallery />));
} else if (display) {
  void import('./display/PublicDisplay.js').then(({ PublicDisplay }) =>
    mount(<PublicDisplay displayKey={decodeURIComponent(display)} />),
  );
} else if (kiosk) {
  void import('./kiosk/KioskScreen.js').then(({ KioskScreen }) =>
    mount(<KioskScreen kioskKey={decodeURIComponent(kiosk)} />),
  );
} else {
  mount(<App />);
}
