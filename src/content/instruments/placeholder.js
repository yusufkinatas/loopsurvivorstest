// Stand-in sounds for styles whose instruments are still being written. placeholder(defs, fromId, o) clones
// the definition `fromId` from a role file's array: same pattern, sound and attack, with its own id, name,
// style and blurb (o) and its own remix id and name (o.remix). Levels are copied, so the registry can index
// them without touching the original. Each Heavy and Orchestra file replaces its placeholder wholesale.

export function placeholder(defs, fromId, o) {
  const src = defs.find((d) => d.id === fromId);
  if (!src) throw new Error(`placeholder: no instrument ${fromId}`);
  return {
    ...src,
    ...o,
    placeholder: fromId,
    levels: src.levels.map((lv) => ({ ...lv, pattern: lv.pattern.map((n) => ({ ...n })), stats: { ...lv.stats } })),
    remix: { ...src.remix, stats: { ...src.remix.stats }, ...o.remix },
  };
}
