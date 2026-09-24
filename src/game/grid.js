// Uniform spatial hash for enemy lookups. Small enemies go in the cell under their center;
// big ones (bosses, elites) are inserted into every cell they overlap. Queries dedupe with a stamp.

const MARGIN = 26; // max radius of a center-inserted entity

export class SpatialHash {
  constructor(cell = 72) {
    this.cell = cell;
    this.buckets = new Map();
    this.used = [];
    this.stamp = 1;
  }

  clear() {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
  }

  _bucket(cx, cy) {
    const k = ((cx & 0xffff) << 16) | (cy & 0xffff);
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    if (b.length === 0) this.used.push(b);
    return b;
  }

  insert(e) {
    const c = this.cell;
    if (e.r <= MARGIN) {
      this._bucket(Math.floor(e.x / c), Math.floor(e.y / c)).push(e);
      return;
    }
    const x0 = Math.floor((e.x - e.r) / c), x1 = Math.floor((e.x + e.r) / c);
    const y0 = Math.floor((e.y - e.r) / c), y1 = Math.floor((e.y + e.r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) this._bucket(cx, cy).push(e);
  }

  // Calls fn(e) once for every entity whose cell touches the circle (x, y, r + MARGIN).
  // The callback must do its own exact distance test.
  query(x, y, r, fn) {
    const c = this.cell;
    const rr = r + MARGIN;
    const x0 = Math.floor((x - rr) / c), x1 = Math.floor((x + rr) / c);
    const y0 = Math.floor((y - rr) / c), y1 = Math.floor((y + rr) / c);
    const s = ++this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(((cx & 0xffff) << 16) | (cy & 0xffff));
        if (!b || b.length === 0) continue;
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (e._q === s) continue;
          e._q = s;
          if (fn(e) === false) return;
        }
      }
    }
  }
}
