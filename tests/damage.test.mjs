import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEuroCents,
  invoiceTotals,
  nextDamageStatus,
} from "../src/lib/damage.ts";
test("invoice amounts use integer cents and round VAT once", () => {
  assert.equal(parseEuroCents("120,50"), 12050);
  assert.equal(parseEuroCents("120.5"), 12050);
  for (const amount of ["-1", "0", "1e3", "1,234", "1.000,00", "NaN", ""])
    assert.equal(parseEuroCents(amount), undefined);
  assert.deepEqual(invoiceTotals(12050, 1900), {
    taxCents: 2290,
    totalCents: 14340,
  });
  assert.deepEqual(invoiceTotals(101, 700), { taxCents: 7, totalCents: 108 });
  assert.deepEqual(invoiceTotals(10000, 0), { taxCents: 0, totalCents: 10000 });
});
test("workflow progresses from report through processing, invoice and payment", () => {
  assert.equal(nextDamageStatus("created"), "in_progress");
  assert.equal(nextDamageStatus("in_progress"), "invoiced");
  assert.equal(nextDamageStatus("invoiced"), "paid");
  assert.equal(nextDamageStatus("paid"), undefined);
});
