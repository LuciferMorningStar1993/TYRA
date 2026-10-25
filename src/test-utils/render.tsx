// Utilidades mínimas sobre test-renderer (el renderer que ya usa jest-expo).
import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';

import type { Profile } from '@/lib/profile';

const mountedRoots = new Set<Root>();

export async function render(element: ReactElement): Promise<Root> {
  const root = createRoot();
  mountedRoots.add(root);
  await act(async () => {
    root.render(element);
  });
  return root;
}

/** Desmonta un árbol a mitad de prueba (p. ej. simular cerrar la app). */
export async function unmount(root: Root): Promise<void> {
  mountedRoots.delete(root);
  await act(async () => {
    root.unmount();
  });
}

/**
 * Desmonta todos los árboles renderizados. Al desmontar, los efectos limpian sus
 * temporizadores y suscripciones, así nada sigue corriendo después de cada prueba.
 */
export async function cleanup(): Promise<void> {
  const roots = [...mountedRoots];
  mountedRoots.clear();
  await act(async () => {
    for (const root of roots) root.unmount();
  });
}

// Limpieza automática tras cada prueba, como Testing Library (este módulo solo se importa en pruebas).
afterEach(cleanup);

/**
 * Captura el valor de un hook (p. ej. useSession) para hacer aserciones fuera de React.
 * Uso: const session = createProbe(useSession); render(<session.Probe />); session.value.route
 */
export function createProbe<T>(useValue: () => T) {
  const captured: { current: T | null } = { current: null };
  function Probe() {
    const value = useValue();
    useEffect(() => {
      captured.current = value;
    });
    return null;
  }
  return {
    Probe,
    get value(): T {
      if (captured.current === null) throw new Error('El Probe aún no se ha renderizado');
      return captured.current;
    },
  };
}

/** Deja correr promesas pendientes y efectos dentro de act. */
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

/** Todo el texto visible del árbol, con los espacios normalizados. */
export function allText(node: TestInstance | string): string {
  const raw = (current: TestInstance | string): string =>
    typeof current === 'string' ? current : current.children.map(raw).join(' ');
  return raw(node).replace(/\s+/g, ' ').trim();
}

export function byLabel(root: Root, label: string | RegExp): TestInstance[] {
  return root.container.queryAll(
    (instance) =>
      typeof instance.props.accessibilityLabel === 'string' &&
      (typeof label === 'string' ? instance.props.accessibilityLabel === label : label.test(instance.props.accessibilityLabel)),
    { matchDeepestOnly: true },
  );
}

/**
 * Pulsa un elemento: busca el primer `onPress` subiendo por el árbol de React (los
 * Pressable no lo exponen en el nodo host), como hace Testing Library.
 */
export async function press(instance: TestInstance): Promise<void> {
  let fiber = instance.unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  if (!fiber) throw new Error('El elemento no tiene onPress');
  if (fiber.memoizedProps.disabled) throw new Error('El elemento está deshabilitado');
  const onPress = fiber.memoizedProps.onPress;
  await act(async () => {
    onPress(); // sin await: una acción lenta (p. ej. guardar) no bloquea la prueba
  });
}

/** Promesa que se resuelve a mano: sirve para simular respuestas lentas o fuera de orden. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

export function profileFixture(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-a',
    display_name: 'Ana',
    sex: null,
    birth_date: null,
    height_cm: null,
    weight_kg: null,
    activity_level: null,
    goal: null,
    gender: null,
    phone: null,
    theme_palette: null,
    color_mode: null,
    onboarded_at: null,
    created_at: '2026-10-24T00:00:00Z',
    updated_at: '2026-10-24T00:00:00Z',
    ...overrides,
  };
}
