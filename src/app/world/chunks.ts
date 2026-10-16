/** Spatial chunking of geometry builders so meshes can be frustum-culled per cell. */
export class ChunkSet<B> {
  readonly map = new Map<string, { key: string; cx: number; cz: number; b: B }>();
  constructor(public readonly cell: number, private readonly make: () => B) {}
  get(x: number, z: number): B {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    const key = ix + ',' + iz;
    let c = this.map.get(key);
    if (!c) { c = { key, cx: (ix + 0.5) * this.cell, cz: (iz + 0.5) * this.cell, b: this.make() }; this.map.set(key, c); }
    return c.b;
  }
  entries() { return [...this.map.values()]; }
}
