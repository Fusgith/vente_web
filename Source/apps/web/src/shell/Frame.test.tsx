import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from './Frame.js';
import { useStatusLine } from './status-line.js';
import { StatusLineProvider } from './StatusLineProvider.js';

/** Buttons standing in for a workspace that talks through the status line. */
function Speaker() {
  const line = useStatusLine();
  return (
    <>
      <button type="button" onClick={() => line.say('Ajouté : 3 pièce', 'check')}>
        say
      </button>
      <button type="button" onClick={() => line.sayError('Stock insuffisant')}>
        error
      </button>
      <button type="button" onClick={line.clear}>
        clear
      </button>
    </>
  );
}

function Workspace() {
  return (
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <Speaker />
      </Frame>
    </StatusLineProvider>
  );
}

describe('Frame', () => {
  it('prints the one sentence of the workspace in its live bottom band', () => {
    const { container } = render(<Workspace />);
    expect(container.firstElementChild).toHaveAttribute('data-workspace', 'sales');
    const band = within(screen.getByRole('contentinfo'));
    const news = band.getByRole('status');
    const alert = band.getByRole('alert');
    expect(news).toBeEmptyDOMElement();
    expect(alert).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'say' }));
    expect(news).toHaveTextContent('Ajouté : 3 pièce');

    // An error interrupts: it is said in the assertive region and replaces the news.
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    expect(alert).toHaveTextContent('Stock insuffisant');
    expect(news).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(alert).toBeEmptyDOMElement();
  });

  it('keeps a static note out of the live regions (login)', () => {
    render(
      <Frame
        workspace="login"
        name={labels.login.title}
        wordmarkHeading
        note={labels.login.instruction}
      >
        <p>content</p>
      </Frame>,
    );
    expect(screen.getByRole('heading', { level: 1, name: labels.appName })).toBeVisible();
    expect(screen.getByText(labels.login.instruction)).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
