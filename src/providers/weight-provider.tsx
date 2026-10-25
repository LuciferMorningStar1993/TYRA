import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { formatDateOnly } from '@/lib/profile';
import { currentWeight, type CurrentWeight, type WeightEntry } from '@/lib/weight';
import {
  addWeightEntry,
  deleteWeightEntry,
  loadWeightOverview,
  updateWeightEntry,
  type WeightMutationResult,
  type WeightOverview,
} from '@/lib/weight-api';
import { useSession } from '@/providers/session-provider';

/** Meses que se cargan para los resúmenes: el actual y los 12 anteriores (cubre el rango de 1 año). */
export const MONTHS_LOADED = 13;

export type WeightState =
  | { status: 'loading' }
  | { status: 'ready'; overview: WeightOverview }
  | { status: 'error'; message: string };

export type WeightActionResult = WeightMutationResult | { status: 'stale_session' };

type WeightContextValue = {
  /** Estado del usuario de la sesión actual. */
  state: WeightState;
  /** Peso vigente: fechada más reciente → heredado sin fecha → ninguno. */
  current: CurrentWeight;
  /** Sube con cada carga confirmada; las pantallas con páginas propias se reinician al cambiar. */
  revision: number;
  reload: () => Promise<void>;
  addEntry: (input: { measuredOn: string; weightKg: number }, expectedUserId?: string) => Promise<WeightActionResult>;
  updateEntry: (
    entry: Pick<WeightEntry, 'id' | 'version'>,
    patch: { measuredOn: string; weightKg: number },
    expectedUserId?: string,
  ) => Promise<WeightActionResult>;
  deleteEntry: (entry: Pick<WeightEntry, 'id' | 'version'>, expectedUserId?: string) => Promise<WeightActionResult>;
};

const WeightContext = createContext<WeightContextValue | null>(null);

export function useWeight(): WeightContextValue {
  const value = use(WeightContext);
  if (!value) throw new Error('useWeight debe usarse dentro de <WeightProvider>');
  return value;
}

function firstMonthLoaded(today = new Date()): string {
  return formatDateOnly(new Date(today.getFullYear(), today.getMonth() - (MONTHS_LOADED - 1), 1));
}

/**
 * Peso del usuario de la sesión, compartido por Inicio, Salud y las pantallas de peso: tras guardar,
 * todas leen el mismo estado. Igual que session-provider, cada lectura lleva un número y la
 * generación de sesión; las respuestas de peticiones o sesiones anteriores se descartan.
 */
export function WeightProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [stored, setStored] = useState<{ userId: string; state: WeightState } | null>(null);
  const [revision, setRevision] = useState(0);
  const latestRequest = useRef(0);
  const generation = useRef(0);

  /** Aplica una respuesta solo si sigue siendo la petición vigente de la misma sesión. */
  const apply = useCallback(
    (id: string, requestId: number, requestGeneration: number, result: Awaited<ReturnType<typeof loadWeightOverview>>) => {
      if (requestId !== latestRequest.current || requestGeneration !== generation.current) return;
      setStored({
        userId: id,
        state:
          result.status === 'ok' ? { status: 'ready', overview: result.data } : { status: 'error', message: result.message },
      });
      if (result.status === 'ok') setRevision((value) => value + 1);
    },
    [],
  );

  const load = useCallback(
    async (id: string) => {
      const requestId = ++latestRequest.current;
      const requestGeneration = generation.current;
      apply(id, requestId, requestGeneration, await loadWeightOverview(id, firstMonthLoaded()));
    },
    [apply],
  );

  useEffect(() => {
    if (!userId) return;
    const requestId = ++latestRequest.current;
    const requestGeneration = generation.current;
    void loadWeightOverview(userId, firstMonthLoaded()).then((result) => apply(userId, requestId, requestGeneration, result));
    // Cambio de usuario (o cerrar sesión): las peticiones y escrituras en curso quedan invalidadas.
    // El estado guardado de otro usuario no se muestra (se compara userId al leerlo).
    return () => {
      generation.current += 1;
      latestRequest.current += 1;
    };
  }, [userId, apply]);

  const reload = useCallback(async () => {
    if (userId) await load(userId);
  }, [userId, load]);

  /** Ejecuta una escritura de la sesión actual y, si el servidor respondió, recarga el estado. */
  const mutate = useCallback(
    async (run: () => Promise<WeightMutationResult>, expectedUserId?: string): Promise<WeightActionResult> => {
      if (!userId || (expectedUserId && expectedUserId !== userId)) return { status: 'stale_session' };
      const requestGeneration = generation.current;
      const result = await run();
      if (requestGeneration !== generation.current) return { status: 'stale_session' };
      // También tras un conflicto: así se ve lo que cambió en el otro dispositivo.
      if (result.status !== 'error' && result.status !== 'duplicate_day') await load(userId);
      return result;
    },
    [userId, load],
  );

  const addEntry = useCallback<WeightContextValue['addEntry']>(
    (input, expectedUserId) => mutate(() => addWeightEntry(input), expectedUserId),
    [mutate],
  );
  const updateEntry = useCallback<WeightContextValue['updateEntry']>(
    (entry, patch, expectedUserId) => mutate(() => updateWeightEntry(entry, patch), expectedUserId),
    [mutate],
  );
  const deleteEntry = useCallback<WeightContextValue['deleteEntry']>(
    (entry, expectedUserId) => mutate(() => deleteWeightEntry(entry), expectedUserId),
    [mutate],
  );

  const state: WeightState = stored && stored.userId === userId ? stored.state : { status: 'loading' };
  const current =
    state.status === 'ready' ? currentWeight(state.overview.recent[0] ?? null, state.overview.legacy) : null;

  return (
    <WeightContext value={{ state, current, revision, reload, addEntry, updateEntry, deleteEntry }}>
      {children}
    </WeightContext>
  );
}
