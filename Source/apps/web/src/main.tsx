import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './fonts.css';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const mount = (node: ReactNode) => createRoot(root).render(<StrictMode>{node}</StrictMode>);

// The public display, opened by its station key without an account (RG-DSP-03).
const display = /^\/ecran\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];

// The design gallery exists only in development: the build drops this branch and its chunk.
if (import.meta.env.DEV && window.location.pathname === '/__design') {
  void import('./dev/DesignGallery.js').then(({ DesignGallery }) => mount(<DesignGallery />));
} else if (display) {
  void import('./display/PublicDisplay.js').then(({ PublicDisplay }) =>
    mount(<PublicDisplay displayKey={decodeURIComponent(display)} />),
  );
} else {
  mount(<App />);
}
