// Escritor "la última elección gana": envía los valores en orden, uno a la vez, y si
// llegan varios mientras hay una escritura en curso solo envía el más reciente.
// Así una respuesta lenta nunca puede dejar guardado un valor viejo.

export type WriteResult = { ok: true } | { ok: false; error: string };

export function createLatestWriter<T>(
  write: (value: T) => Promise<WriteResult>,
  /** Se llama solo con el resultado del último valor pedido (los intermedios se descartan). */
  onLatestSettled: (value: T, result: WriteResult) => void,
) {
  let inFlight = false;
  let pending: { value: T } | null = null;

  async function run(value: T): Promise<void> {
    inFlight = true;
    let result: WriteResult;
    try {
      result = await write(value);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    inFlight = false;
    if (pending) {
      const next = pending.value;
      pending = null;
      return run(next);
    }
    onLatestSettled(value, result);
  }

  return {
    set(value: T): void {
      if (inFlight) {
        pending = { value };
      } else {
        void run(value);
      }
    },
  };
}
