import { createLatestWriter, type WriteResult } from './latest-writer';

/** Escritura controlada: cada llamada queda pendiente hasta resolverla a mano. */
function controlledWrite() {
  const calls: { value: string; resolve: (result: WriteResult) => void }[] = [];
  const write = jest.fn(
    (value: string) => new Promise<WriteResult>((resolve) => calls.push({ value, resolve })),
  );
  return { write, calls };
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('createLatestWriter', () => {
  it('cambios rápidos: envía en orden y solo el último pendiente', async () => {
    const { write, calls } = controlledWrite();
    const settled = jest.fn();
    const writer = createLatestWriter(write, settled);

    writer.set('aurora');
    writer.set('nordic');
    writer.set('indigo');
    expect(calls.map((call) => call.value)).toEqual(['aurora']);

    calls[0].resolve({ ok: true });
    await flush();
    expect(calls.map((call) => call.value)).toEqual(['aurora', 'indigo']);
    expect(settled).not.toHaveBeenCalled();

    calls[1].resolve({ ok: true });
    await flush();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith('indigo', { ok: true });
  });

  it('un error intermedio no se reporta si hay una elección más reciente', async () => {
    const { write, calls } = controlledWrite();
    const settled = jest.fn();
    const writer = createLatestWriter(write, settled);

    writer.set('aurora');
    writer.set('nordic');
    calls[0].resolve({ ok: false, error: 'timeout' });
    await flush();
    calls[1].resolve({ ok: true });
    await flush();

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith('nordic', { ok: true });
  });

  it('el error de la última elección es visible', async () => {
    const { write, calls } = controlledWrite();
    const settled = jest.fn();
    createLatestWriter(write, settled).set('nordic');

    calls[0].resolve({ ok: false, error: 'no_row' });
    await flush();
    expect(settled).toHaveBeenCalledWith('nordic', { ok: false, error: 'no_row' });
  });

  it('una excepción de red se convierte en error', async () => {
    const settled = jest.fn();
    createLatestWriter(() => Promise.reject(new Error('Network request failed')), settled).set('indigo');
    await flush();
    expect(settled).toHaveBeenCalledWith('indigo', { ok: false, error: 'Network request failed' });
  });

  it('tras terminar, un nuevo valor se envía de inmediato', async () => {
    const { write, calls } = controlledWrite();
    const writer = createLatestWriter(write, jest.fn());
    writer.set('aurora');
    calls[0].resolve({ ok: true });
    await flush();
    writer.set('nordic');
    expect(calls.map((call) => call.value)).toEqual(['aurora', 'nordic']);
  });
});
