import test from "node:test";
import assert from "node:assert/strict";
import { recordChanges } from "../src/lib/record-changes.ts";

test("master-data diff writes only new or changed records and explicit deletions", () => {
  const before = [
    { id: "a", name: "Anna" },
    { id: "b", name: "Berta" },
    { id: "c", name: "Clara" },
  ];
  const after = [
    { name: "Anna", id: "a" },
    { id: "b", name: "Beate" },
    { id: "d", name: "Dora" },
  ];
  assert.deepEqual(recordChanges(before, after), {
    upserts: [
      { id: "b", name: "Beate" },
      { id: "d", name: "Dora" },
    ],
    removed: ["c"],
  });
  assert.equal(before[1].name, "Berta");
});

test("unchanged snapshots create no record writes", () => {
  const rows = [{ id: "a", name: "Anna", ownerId: "" }];
  assert.deepEqual(recordChanges(rows, structuredClone(rows)), {
    upserts: [],
    removed: [],
  });
  assert.deepEqual(recordChanges(rows, []), { upserts: [], removed: ["a"] });
});
