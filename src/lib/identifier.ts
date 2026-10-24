// Normalización de los identificadores con los que se puede iniciar sesión.

const DEFAULT_COUNTRY_CODE = '52'; // México

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Convierte un teléfono escrito a mano a formato E.164 (+525512345678).
 * Diez dígitos sin lada se asumen de México. Devuelve null si no es válido.
 */
export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  let e164: string;
  if (trimmed.startsWith('+')) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+${DEFAULT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    e164 = `+${digits}`;
  } else {
    return null;
  }
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

export type Identifier = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };

/** Interpreta el campo "Correo o teléfono" del login. */
export function parseIdentifier(value: string): Identifier | null {
  if (isEmail(value)) return { kind: 'email', email: value.trim().toLowerCase() };
  const phone = normalizePhone(value);
  return phone ? { kind: 'phone', phone } : null;
}

/** Mismas reglas que Auth (config.toml): mínimo 8, con letras y números. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Usa al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Incluye letras y números.';
  return null;
}
