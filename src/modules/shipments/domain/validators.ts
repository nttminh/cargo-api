import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * ISO 6346 container number: 3-letter owner code + equipment category (U/J/Z)
 * + 6-digit serial + check digit, e.g. MSCU1234565.
 */
export function isValidContainerNumber(value: string): boolean {
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(value)) return false;
  // Letter values skip multiples of 11 (A=10, B=12 ... K=21, L=23 ...).
  const letterValue = (ch: string) => {
    let v = ch.charCodeAt(0) - 55; // A -> 10
    v += Math.floor((v - 1) / 10); // skip 11, 22, 33
    return v;
  };
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = value[i];
    const v = i < 4 ? letterValue(ch) : Number(ch);
    sum += v * 2 ** i;
  }
  const check = (sum % 11) % 10;
  return check === Number(value[10]);
}

/**
 * IATA air waybill number: 3-digit airline prefix + 8-digit serial whose last digit
 * is the first 7 digits modulo 7. Accepts "738-12345675" or "73812345675".
 */
export function isValidAwbNumber(value: string): boolean {
  const m = /^(\d{3})-?(\d{7})(\d)$/.exec(value);
  if (!m) return false;
  return Number(m[2]) % 7 === Number(m[3]);
}

export const normalizeAwb = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

export function IsContainerNumber(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isContainerNumber',
      target: object.constructor,
      propertyName,
      options: { message: '$property must be a valid ISO 6346 container number', ...options },
      validator: { validate: (v: unknown) => typeof v === 'string' && isValidContainerNumber(v) },
    });
}
