import { defaultValue, type IRType } from '../ir/instructions';
import { RuntimeError } from './runtime-errors';
import { copyValue, type HeapReference, type RuntimeValue } from './stack';

/** Plain copy of a Heap block for the UI and tests. */
export interface HeapBlock {
  readonly address: number;
  readonly elementType: IRType;
  readonly values: RuntimeValue[];
}

interface StoredBlock {
  readonly elementType: IRType;
  readonly values: RuntimeValue[];
}

/**
 * Simple non-moving heap of typed blocks (one block per array).
 * Addresses start at 1 and are never reused; there is no GC or free, so a
 * reference stays valid for the lifetime of the Heap instance.
 */
export class RuntimeHeap {
  private readonly blocks = new Map<number, StoredBlock>();
  private nextAddress = 1;

  /** Reserves `length` cells, each initialized with `defaultValue(elementType)`. */
  allocate(elementType: IRType, length: number): HeapReference {
    if (!Number.isInteger(length) || length < 0) {
      throw new RuntimeError(`Tamaño de arreglo inválido: ${String(length)}.`, 'INVALID_PROGRAM');
    }
    const address = this.nextAddress++;
    const initial = defaultValue(elementType);
    this.blocks.set(address, { elementType, values: Array.from({ length }, () => initial) });
    return { address };
  }

  has(reference: HeapReference): boolean {
    return this.blocks.has(reference.address);
  }

  elementType(reference: HeapReference): IRType {
    return this.getBlock(reference).elementType;
  }

  length(reference: HeapReference): number {
    return this.getBlock(reference).values.length;
  }

  read(reference: HeapReference, index: number): RuntimeValue {
    const block = this.getBlock(reference);
    checkIndex(index, block.values.length);
    return copyValue(block.values[index]);
  }

  write(reference: HeapReference, index: number, value: RuntimeValue): void {
    const block = this.getBlock(reference);
    checkIndex(index, block.values.length);
    block.values[index] = copyValue(value);
  }

  snapshot(): HeapBlock[] {
    return [...this.blocks].map(([address, block]) => ({
      address,
      elementType: block.elementType,
      values: block.values.map(copyValue),
    }));
  }

  private getBlock(reference: HeapReference): StoredBlock {
    const block = this.blocks.get(reference.address);
    if (!block) {
      throw new RuntimeError(`La referencia @${reference.address} no apunta a ningún bloque del Heap.`, 'INVALID_REFERENCE');
    }
    return block;
  }
}

function checkIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    const valid = length === 0 ? 'el arreglo está vacío' : `índices válidos 0..${length - 1}`;
    throw new RuntimeError(
      `Índice ${String(index)} fuera de rango: el arreglo tiene ${length} elemento(s) (${valid}).`,
      'HEAP_OUT_OF_BOUNDS',
    );
  }
}
