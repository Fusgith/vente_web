/** A typed number, the comma as decimal mark and spaces ignored: « 1 500,5 » → « 1500.5 ». */
export const typed = (value: string) => value.replace(/\s/g, '').replace(',', '.');
/** An empty optional field travels as null. */
export const orNull = (value: string) => (typed(value) === '' ? null : typed(value));
