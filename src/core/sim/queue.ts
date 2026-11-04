type Entry = { time: number; order: number; run: () => void };

/** Binary min-heap on time. Ties resolve in insertion order, which keeps runs deterministic. */
export class EventQueue {
  private readonly heap: Entry[] = [];
  private nextOrder = 0;

  get size(): number {
    return this.heap.length;
  }

  push(time: number, run: () => void): void {
    this.heap.push({ time, order: this.nextOrder++, run });
    this.siftUp(this.heap.length - 1);
  }

  pop(): Entry | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top !== undefined && last !== undefined && this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private before(a: number, b: number): boolean {
    const left = this.heap[a] as Entry;
    const right = this.heap[b] as Entry;
    return left.time < right.time || (left.time === right.time && left.order < right.order);
  }

  private swap(a: number, b: number): void {
    const held = this.heap[a] as Entry;
    this.heap[a] = this.heap[b] as Entry;
    this.heap[b] = held;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(index, parent)) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.heap.length && this.before(left, smallest)) smallest = left;
      if (right < this.heap.length && this.before(right, smallest)) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }
}
