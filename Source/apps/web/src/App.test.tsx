import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';
import { labels } from './labels.js';

describe('App', () => {
  it('renders the application name', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(labels.appName);
  });

  it('shows amounts through the shared formatter, NBSP included (RG-FMT-01)', () => {
    render(<App />);

    // Raw textContent: jest-dom's matchers would collapse the non-breaking spaces.
    expect(screen.getByTestId('sample-amount-value').textContent).toBe(
      '1\u00A0250\u00A0000,00\u00A0Ar',
    );
  });
});
