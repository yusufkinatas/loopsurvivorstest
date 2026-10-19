// A collection of performance milestones. Every instrument is available from the first run.
export const RECORDS = [
  { id: 'first-set', name: 'First pressing', description: 'Keep your first set alive for 60 seconds.' },
  { id: 'crowd-control', name: 'In the groove', description: 'Chain 25 silences without taking a hit.' },
  { id: 'full-band', name: 'Wall of sound', description: 'Finish a run with all six channels playing.' },
  { id: 'on-beat', name: 'Perfect timing', description: 'Land 10 on-beat dashes in one set.' },
  { id: 'headliner', name: 'Headliner', description: 'Silence White Noise and finish the song.' },
  { id: 'no-silence', name: 'Noise complaint', description: 'Silence 1,000 enemies in one set.' },
];

export function emptyCareer() {
  return { runs: 0, wins: 0, kills: 0, bestCombo: 0, perfectDashes: 0, discovered: [], records: [] };
}

export function updateCareer(previous, sum) {
  const career = { ...emptyCareer(), ...previous };
  career.runs++;
  career.wins += sum.won ? 1 : 0;
  career.kills += Math.max(0, sum.kills || 0);
  career.bestCombo = Math.max(career.bestCombo, sum.bestCombo || 0);
  career.perfectDashes += Math.max(0, sum.perfectDashes || 0);
  career.discovered = [...new Set([...career.discovered, ...(sum.instruments || []).map((i) => i.id)])];
  const earned = {
    'first-set': sum.time >= 60,
    'crowd-control': sum.bestCombo >= 25,
    'full-band': new Set((sum.instruments || []).filter((i) => i.active).map((i) => i.role)).size >= 6,
    'on-beat': sum.perfectDashes >= 10,
    'headliner': !!sum.won,
    'no-silence': sum.kills >= 1000,
  };
  const newRecords = RECORDS.filter((r) => earned[r.id] && !career.records.includes(r.id));
  career.records = [...career.records, ...newRecords.map((r) => r.id)];
  return { career, newRecords };
}
