import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kitchenReferenceId,
  kitchenCutCSV,
} from "../src/kitchen-admin-export.ts";
import {
  buildFurniture,
  defaultSettings,
  seedProducts,
} from "../lib/furniture.ts";

test("admin accepts only kitchen IDs and kitchen links", () => {
  const id = "12345678-1234-4567-8910-123456789abc";
  assert.equal(kitchenReferenceId(id.toUpperCase()), id);
  assert.equal(
    kitchenReferenceId(`https://alrazz.pages.dev/cocinas?cocina=${id}`),
    id,
  );
  assert.equal(kitchenReferenceId(`/cocinas?cocina=${id}`), id);
  assert.equal(
    kitchenReferenceId(`http://localhost:5173/cocinas?cocina=${id}`),
    id,
  );
  assert.throws(() =>
    kitchenReferenceId(`https://alrazz.pages.dev/configurar?cocina=${id}`),
  );
  assert.throws(() => kitchenReferenceId(`javascript:/cocinas?cocina=${id}`));
  assert.throws(() =>
    kitchenReferenceId(
      `https://user:password@example.com/cocinas?cocina=${id}`,
    ),
  );
  assert.throws(() => kitchenReferenceId("../../etc/password"));
});

test("kitchen CSV separates 6 mm glass from 18 mm melamine and neutralizes formulas", () => {
  const base = structuredClone(seedProducts[0]);
  base.frontOptions = ["melamine", "glass", "aluminum-glass"];
  const config = {
    ...base.defaults,
    height: 1000,
    doors: "full" as const,
    front: "aluminum-glass" as const,
    handle: "exterior" as const,
  };
  const result = buildFurniture(base, config, defaultSettings);
  const csv = kitchenCutCSV([
    { itemId: "m1", product: { name: "=FORMULA()" }, result },
  ]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('"VIDRIO"'));
  assert.ok(csv.includes('"MELAMINA"'));
  assert.equal(
    csv.split("\r\n").filter((line) => line.includes('"MELAMINA"')).length,
    result.panels.length,
  );
  for (const row of csv
    .split("\r\n")
    .filter((line) => line.includes('"VIDRIO"')))
    assert.ok(row.includes(';"6";'));
  for (const name of [
    "\u0000=FORMULA()",
    "\t=FORMULA()",
    "\r+FORMULA()",
    " @FORMULA()",
  ])
    assert.ok(
      kitchenCutCSV([{ itemId: "m1", product: { name }, result }]).includes(
        `"'${name}"`,
      ),
    );
});
