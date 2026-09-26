import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EraseKey, Key, Keypad } from './Keypad.js';
import { Sheet } from './Sheet.js';

describe('Keypad', () => {
  it('lays the digits out in phone order, 0 under 8, and names each key by its digit', () => {
    const onDigit = vi.fn();
    const onErase = vi.fn();
    render(
      <Keypad
        onDigit={onDigit}
        left={<Key>,</Key>}
        right={<EraseKey label="Effacer un chiffre" onErase={onErase} />}
      />,
    );

    const names = screen
      .getAllByRole('button')
      .map((key) => key.getAttribute('aria-label') ?? key.textContent);
    expect(names).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      ',',
      '0',
      'Effacer un chiffre',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer un chiffre' }));
    expect(onDigit).toHaveBeenCalledWith('7');
    expect(onErase).toHaveBeenCalledOnce();
  });

  it('leaves an empty cell when a side key is null', () => {
    render(<Keypad onDigit={vi.fn()} left={null} right={null} disabled />);
    expect(screen.getAllByRole('button')).toHaveLength(10);
    expect(screen.getByRole('button', { name: '0' })).toBeDisabled();
  });
});

function SheetHarness({ onClose }: { onClose(): void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      {open && (
        <Sheet
          title="Catégories"
          closeLabel="Fermer"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <button type="button">Alimentation</button>
        </Sheet>
      )}
    </>
  );
}

describe('Sheet', () => {
  it('opens as a named dialog and closes with its button', () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} />);

    const sheet = screen.getByRole('dialog', { name: 'Catégories' });
    expect(within(sheet).getByRole('button', { name: 'Alimentation' })).toBeVisible();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape (the dialog cancel event)', () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} />);

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
