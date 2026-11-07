import { isValidAwbNumber, isValidContainerNumber, normalizeAwb } from './validators';

describe('isValidContainerNumber (ISO 6346)', () => {
  it.each(['CSQU3054383', 'MSKU9070323'])('accepts %s', (n) =>
    expect(isValidContainerNumber(n)).toBe(true),
  );

  it.each([
    ['CSQU3054384', 'wrong check digit'],
    ['CSQX3054383', 'invalid equipment category'],
    ['CSQU305438', 'too short'],
    ['csqu3054383', 'lower case'],
    ['1SQU3054383', 'digit in owner code'],
  ])('rejects %s (%s)', (n) => expect(isValidContainerNumber(n)).toBe(false));
});

describe('isValidAwbNumber (IATA mod-7)', () => {
  it.each(['738-12345675', '73812345675', '618-00000000', '020-11111111'])('accepts %s', (n) =>
    expect(isValidAwbNumber(n)).toBe(true),
  );

  it.each(['738-12345676', '738-1234567', 'ABC-12345675', '7381234567500'])('rejects %s', (n) =>
    expect(isValidAwbNumber(n)).toBe(false),
  );

  it('normalizes to NNN-NNNNNNNN', () => {
    expect(normalizeAwb('73812345675')).toBe('738-12345675');
    expect(normalizeAwb('738 1234 5675')).toBe('738-12345675');
  });
});
