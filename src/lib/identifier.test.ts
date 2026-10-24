import { isEmail, normalizePhone, parseIdentifier, passwordProblem } from './identifier';

describe('normalizePhone', () => {
  it.each([
    ['55 1234 5678', '+525512345678'],
    ['(55) 1234-5678', '+525512345678'],
    ['525512345678', '+525512345678'],
    ['+52 55 1234 5678', '+525512345678'],
    ['+1 415 555 0100', '+14155550100'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['12345', 'abc', '+0123456789', ''])('rechaza %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('parseIdentifier', () => {
  it('detecta correo y lo normaliza', () => {
    expect(parseIdentifier('  Brayan@Gmail.com ')).toEqual({ kind: 'email', email: 'brayan@gmail.com' });
  });

  it('detecta teléfono', () => {
    expect(parseIdentifier('5512345678')).toEqual({ kind: 'phone', phone: '+525512345678' });
  });

  it('devuelve null si no es ninguno', () => {
    expect(parseIdentifier('hola')).toBeNull();
  });
});

describe('isEmail', () => {
  it('requiere dominio', () => {
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a@b.mx')).toBe(true);
  });
});

describe('passwordProblem', () => {
  it('exige longitud y letras + números', () => {
    expect(passwordProblem('abc1')).toMatch(/8/);
    expect(passwordProblem('abcdefgh')).toMatch(/números/);
    expect(passwordProblem('12345678')).toMatch(/letras/);
    expect(passwordProblem('tyra2026!')).toBeNull();
  });
});
