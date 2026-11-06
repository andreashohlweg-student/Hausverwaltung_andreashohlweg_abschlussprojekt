/** Compare flat domain records by their values, independent of JSON key order. */
export function recordChanges<T extends { id: string }>(
  before: T[],
  after: T[],
) {
  const previous = new Map(before.map((record) => [record.id, record]));
  const current = new Set(after.map((record) => record.id));
  return {
    upserts: after.filter((record) => {
      const old = previous.get(record.id);
      return (
        !old ||
        (Object.keys(record) as (keyof T)[]).some(
          (key) => record[key] !== old[key],
        )
      );
    }),
    removed: before
      .filter((record) => !current.has(record.id))
      .map((record) => record.id),
  };
}
