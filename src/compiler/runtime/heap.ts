import type { HeapReference, RuntimeValue } from './stack';
import { RuntimeError } from './runtime-errors';

export interface HeapBlock {
  readonly address: number;
  readonly values: RuntimeValue[];
}

/** Simple non-moving heap. Blocks remain allocated until the Heap instance is discarded. */
export class RuntimeHeap {
  private readonly blocks = new Map<number, RuntimeValue[]>();
  private nextAddress = 1;

  allocate(size: number, initialValue: RuntimeValue = null): HeapReference {
    if (!Number.isInteger(size) || size < 0) {
      throw new RuntimeError(`Invalid allocation size: ${size}`, 'INVALID_REFERENCE');
    }
    const address = this.nextAddress++;
    this.blocks.set(address, Array.from({ length: size }, () => initialValue));
    return { address };
  }

  read(reference: HeapReference, index: number): RuntimeValue {
    return this.getCell(reference, index);
  }

  write(reference: HeapReference, index: number, value: RuntimeValue): void {
    const block = this.getBlock(reference);
    this.checkIndex(index, block.length);
    block[index] = value;
  }

  snapshot(): HeapBlock[] {
    return [...this.blocks].map(([address, values]) => ({ address, values: [...values] }));
  }

  private getCell(reference: HeapReference, index: number): RuntimeValue {
    const block = this.getBlock(reference);
    this.checkIndex(index, block.length);
    return block[index];
  }

  private getBlock(reference: HeapReference): RuntimeValue[] {
    const block = this.blocks.get(reference.address);
    if (!block) {
      throw new RuntimeError(`Unknown heap reference at address ${reference.address}`, 'INVALID_REFERENCE');
    }
    return block;
  }

  private checkIndex(index: number, length: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new RuntimeError(`Heap index ${index} is outside block bounds (length ${length})`, 'HEAP_OUT_OF_BOUNDS');
    }
  }
}
