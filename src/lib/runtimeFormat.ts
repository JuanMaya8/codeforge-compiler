import type { HeapReference, RuntimeValue } from '../compiler';

/** A Heap reference is the only object value the VM produces. */
export function isReference(value: RuntimeValue): value is HeapReference {
  return typeof value === 'object' && value !== null;
}

/** Text of a runtime value: `42`, `"hola"`, `true`, `@3` (Heap reference) or `null`. */
export function formatRuntimeValue(value: RuntimeValue): string {
  if (value === null) return 'null';
  if (isReference(value)) return `@${value.address}`;
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/** Kind of a value, used only to color it. */
export function runtimeValueKind(value: RuntimeValue): 'reference' | 'null' | 'string' | 'number' | 'boolean' {
  if (value === null) return 'null';
  if (isReference(value)) return 'reference';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  return 'boolean';
}
