// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { store } from '../src/state/store';

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalPointerCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

// JSDOM lacks modal top-layer rendering and pointer capture. These shims expose
// only the DOM APIs needed to exercise handlers; they do not simulate layout,
// focus trapping, touch hit testing, or native range-control default actions.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true; },
    });
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value() { /* Event routing itself is not provided by JSDOM. */ },
    });
  }
});

beforeEach(async () => {
  await store.disconnect();
  await store.setBus(1);
  await store.setBank(0);
});

afterEach(async () => {
  cleanup();
  await store.disconnect();
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

afterAll(async () => {
  await store.destroy();
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalPointerCapture) Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', originalPointerCapture);
  else Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
});

async function press(element: HTMLElement) {
  await act(async () => { fireEvent.click(element); });
}

async function startDemo() {
  render(<App />);
  await press(screen.getByRole('button', { name: 'Esplora la demo' }));
  await waitFor(() => {
    expect(store.getSnapshot()).toMatchObject({ mode: 'demo', status: 'connected', syncing: false });
    expect(screen.getByText('Simulazione attiva')).toBeTruthy();
  });
}

function sendSwitch(channel: number) {
  return screen.getByRole('switch', { name: `Invio canale ${channel} al mix` }) as HTMLButtonElement;
}

function sendSlider(channel: number) {
  return screen.getByRole('slider', { name: new RegExp(`^Livello invio canale ${channel},`) }) as HTMLInputElement;
}

async function selectBus(bus: number) {
  await press(screen.getByRole('button', { name: `Seleziona bus ${bus}` }));
  await waitFor(() => {
    expect(store.getSnapshot()).toMatchObject({ bus, syncing: false });
    expect(screen.getByRole('button', { name: `Seleziona bus ${bus}` }).getAttribute('aria-pressed')).toBe('true');
  });
}

async function selectBank(bank: number) {
  await press(screen.getByRole('button', { name: `Mostra canali da ${bank * 8 + 1} a ${bank * 8 + 8}` }));
  await waitFor(() => {
    expect(store.getSnapshot()).toMatchObject({ bank, syncing: false });
    expect(sendSlider(bank * 8 + 1).disabled).toBe(false);
  });
}

describe('controller UI with the real store and isolated demo driver', () => {
  it('starts disconnected with unknown values and blocks browser connections to hardware', async () => {
    render(<App />);

    expect(screen.getByText('Non collegato')).toBeTruthy();
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(sliders).toHaveLength(9);
    for (const slider of sliders) {
      expect(slider.disabled).toBe(true);
      expect(slider.getAttribute('aria-valuetext')).toBe('Valore non disponibile');
    }
    expect((screen.getByRole('switch', { name: 'Abilita modifiche al mix' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(store.getSnapshot().strips.every(strip => strip.level === null && strip.sendOn === null)).toBe(true);

    await press(screen.getByRole('button', { name: 'Connessione' }));
    const dialog = screen.getByRole('dialog', { name: 'Collega il tuo WING' });
    expect(within(dialog).getByText('La connessione richiede l’app iPad.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Collega WING' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText('INDIRIZZO IP DEL WING') as HTMLInputElement).disabled).toBe(true);
    expect(store.getSnapshot().nativeAvailable).toBe(false);
    await press(within(dialog).getByRole('button', { name: 'Chiudi pannello' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('makes the simulation explicit and clears its values when exiting', async () => {
    await startDemo();

    expect(screen.getByText('SIMULAZIONE', { exact: true })).toBeTruthy();
    expect(screen.getByText('Dati dimostrativi. Nessun mixer collegato.')).toBeTruthy();
    expect(screen.getByText('AMBIENTE DEMO')).toBeTruthy();
    expect(sendSlider(1).getAttribute('aria-valuetext')).not.toBe('Valore non disponibile');
    expect(screen.getByRole('heading', { name: 'Voce • IEM' })).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Esci dalla demo' }));
    expect(store.getSnapshot()).toMatchObject({ mode: 'idle', status: 'disconnected', console: null, editsEnabled: false });
    expect(screen.queryByText('SIMULAZIONE', { exact: true })).toBeNull();
    for (const slider of screen.getAllByRole('slider') as HTMLInputElement[]) {
      expect(slider.disabled).toBe(true);
      expect(slider.getAttribute('aria-valuetext')).toBe('Valore non disponibile');
    }
  });

  it('locks both channel sends and the master in read-only mode without changing the mix', async () => {
    await startDemo();
    const originalLevels = store.getSnapshot().strips.map(strip => strip.level);
    const originalMaster = store.getSnapshot().busLevel;
    const toggle = screen.getByRole('switch', { name: 'Abilita modifiche al mix' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    await press(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    for (const slider of screen.getAllByRole('slider') as HTMLInputElement[]) expect(slider.disabled).toBe(true);
    for (let channel = 1; channel <= 8; channel++) expect(sendSwitch(channel).disabled).toBe(true);
    expect(store.getSnapshot().strips.map(strip => strip.level)).toEqual(originalLevels);
    expect(store.getSnapshot().busLevel).toBe(originalMaster);

    await press(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    for (const slider of screen.getAllByRole('slider') as HTMLInputElement[]) expect(slider.disabled).toBe(false);
    expect(sendSwitch(1).disabled).toBe(false);
  });

  it('changes real demo sends and preserves their channel and bus scope across navigation', async () => {
    await startDemo();
    await press(sendSwitch(1));
    expect(sendSwitch(1).getAttribute('aria-checked')).toBe('false');

    await selectBus(2);
    expect(sendSwitch(1).getAttribute('aria-checked')).toBe('true');
    await selectBank(1);
    expect(screen.queryByRole('slider', { name: /^Livello invio canale 1,/ })).toBeNull();
    await press(sendSwitch(9));
    expect(sendSwitch(9).getAttribute('aria-checked')).toBe('false');

    await selectBus(1);
    expect(sendSwitch(9).getAttribute('aria-checked')).toBe('true');
    await selectBank(0);
    expect(sendSwitch(1).getAttribute('aria-checked')).toBe('false');
    await selectBus(2);
    await selectBank(1);
    expect(sendSwitch(9).getAttribute('aria-checked')).toBe('false');
    expect(store.getSnapshot().strips.map(strip => strip.channel)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('previews pointer changes locally, cancels without writing, and commits once on release', async () => {
    await startDemo();
    const slider = sendSlider(1);
    const originalLevel = store.getSnapshot().strips[0].level;
    const originalReadout = slider.getAttribute('aria-valuetext');
    const writes = vi.spyOn(store, 'setSendLevel');

    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'touch' });
    fireEvent.change(slider, { target: { value: '800' } });
    fireEvent.change(slider, { target: { value: '810' } });
    expect(slider.getAttribute('aria-valuetext')).not.toBe(originalReadout);
    expect(store.getSnapshot().strips[0].level).toBe(originalLevel);
    expect(writes).not.toHaveBeenCalled();

    fireEvent.pointerCancel(slider, { pointerId: 1, pointerType: 'touch' });
    expect(slider.getAttribute('aria-valuetext')).toBe(originalReadout);
    expect(writes).not.toHaveBeenCalled();

    fireEvent.pointerDown(slider, { pointerId: 2, pointerType: 'touch' });
    fireEvent.change(slider, { target: { value: '830' } });
    fireEvent.change(slider, { target: { value: '840' } });
    expect(writes).not.toHaveBeenCalled();
    await act(async () => { fireEvent.pointerUp(slider, { pointerId: 2, pointerType: 'touch' }); });
    fireEvent.lostPointerCapture(slider, { pointerId: 2, pointerType: 'touch' });

    expect(writes).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().strips[0].level).not.toBe(originalLevel);
    expect(store.getSnapshot().strips[0].pending).toBe(false);
    expect(slider.disabled).toBe(false);
  });

  it('cancels a gesture when editing is revoked before release', async () => {
    await startDemo();
    const slider = sendSlider(1);
    const originalLevel = store.getSnapshot().strips[0].level;
    const originalReadout = slider.getAttribute('aria-valuetext');
    const writes = vi.spyOn(store, 'setSendLevel');

    fireEvent.pointerDown(slider, { pointerId: 7 });
    fireEvent.change(slider, { target: { value: '900' } });
    await press(screen.getByRole('switch', { name: 'Abilita modifiche al mix' }));
    fireEvent.pointerUp(slider, { pointerId: 7 });

    expect(writes).not.toHaveBeenCalled();
    expect(store.getSnapshot().strips[0].level).toBe(originalLevel);
    expect(slider.getAttribute('aria-valuetext')).toBe(originalReadout);
    expect(slider.disabled).toBe(true);
  });

  it('commits range change events without a pointer gesture for both a channel and the master', async () => {
    await startDemo();
    const slider = sendSlider(1);
    const master = screen.getByRole('slider', { name: 'Livello master bus 1' }) as HTMLInputElement;
    const initialChannel = store.getSnapshot().strips[0].level;
    const initialMaster = store.getSnapshot().busLevel;
    const otherChannels = store.getSnapshot().strips.slice(1).map(strip => strip.level);
    const channelWrites = vi.spyOn(store, 'setSendLevel');
    const masterWrites = vi.spyOn(store, 'setBusLevel');

    // A keyboard-operated native range emits this change. JSDOM does not
    // implement the browser's ArrowUp/Home/End default value adjustment.
    slider.focus();
    await act(async () => { fireEvent.change(slider, { target: { value: '860' } }); });
    master.focus();
    await act(async () => { fireEvent.change(master, { target: { value: '820' } }); });

    expect(channelWrites).toHaveBeenCalledTimes(1);
    expect(masterWrites).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().strips[0].level).not.toBe(initialChannel);
    expect(store.getSnapshot().busLevel).not.toBe(initialMaster);
    expect(store.getSnapshot().strips.slice(1).map(strip => strip.level)).toEqual(otherChannels);
    expect(slider.getAttribute('aria-orientation')).toBe('vertical');
    expect(store.getSnapshot().busPending).toBe(false);
  });

  it('exports the actual demo session and makes diagnostics selectable if clipboard access fails', async () => {
    await startDemo();
    await selectBus(4);
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard unavailable in this environment'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await press(screen.getByRole('button', { name: 'Apri attività e diagnostica' }));
    const dialog = screen.getByRole('dialog', { name: 'Attività e diagnostica' });
    const text = within(dialog).getByLabelText('Dati diagnostici JSON') as HTMLTextAreaElement;
    const data = JSON.parse(text.value);
    expect(data).toMatchObject({ mode: 'demo', status: 'connected', hardwareValidated: false, selectedBus: 4, selectedBank: 0 });
    expect(data.strips).toHaveLength(8);
    expect(data.strips[0].level).toBe(store.getSnapshot().strips[0].level);

    await press(within(dialog).getByRole('button', { name: 'Copia diagnostica' }));
    expect(writeText).toHaveBeenCalledWith(text.value);
    expect(within(dialog).getByText(/Copia automatica non disponibile/)).toBeTruthy();
    expect(text.closest('details')?.open).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(text.selectionStart).toBe(0);
    expect(text.selectionEnd).toBe(text.value.length);
  });
});
