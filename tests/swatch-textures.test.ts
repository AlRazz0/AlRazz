import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSwatchTextures } from "../src/swatch-textures.ts";

function pendingTexture() {
  let resolve!: (texture: THREE.Texture) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<THREE.Texture>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("panels share a finish image, preserve its sRGB colour, and release it once", async () => {
  const pending = pendingTexture();
  let requests = 0;
  let renders = 0;
  const swatches = createSwatchTextures(
    () => renders++,
    16,
    () => {
      requests++;
      return pending.promise;
    },
  );
  const first = new THREE.MeshStandardMaterial({ color: "#765432" });
  const second = new THREE.MeshStandardMaterial({ color: "#ab9876" });
  const fallback = first.color.clone();
  swatches.attach(first, "/images/materials/pelikano-rovere.jpeg");
  swatches.attach(second, "/images/materials/pelikano-rovere.jpeg");
  assert.equal(requests, 1);
  assert.equal(first.map, null);
  const texture = new THREE.Texture();
  let disposals = 0;
  texture.addEventListener("dispose", () => disposals++);
  pending.resolve(texture);
  await pending.promise;
  assert.equal(first.map, texture);
  assert.equal(second.map, texture);
  assert.equal(first.color.getHex(), 0xffffff);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.anisotropy, 4);
  assert.equal(renders, 1);
  swatches.dispose();
  swatches.dispose();
  assert.equal(disposals, 1);
  assert.equal(first.map, null);
  assert.ok(first.color.equals(fallback));
});

test("a late image cannot modify or render a scene after its materials change", async () => {
  const pending = pendingTexture();
  let renders = 0;
  const swatches = createSwatchTextures(
    () => renders++,
    1,
    () => pending.promise,
  );
  const material = new THREE.MeshStandardMaterial({ color: "#a18e73" });
  const fallback = material.color.clone();
  swatches.attach(material, "/images/materials/hispano-roble.webp");
  swatches.dispose();
  const texture = new THREE.Texture();
  let disposals = 0;
  texture.addEventListener("dispose", () => disposals++);
  pending.resolve(texture);
  await pending.promise;
  assert.equal(material.map, null);
  assert.ok(material.color.equals(fallback));
  assert.equal(renders, 0);
  assert.equal(disposals, 1);
});

test("failed images retain HEX and external or malformed paths never reach the loader", async () => {
  const pending = pendingTexture();
  let requests = 0;
  let renders = 0;
  const swatches = createSwatchTextures(
    () => renders++,
    1,
    () => {
      requests++;
      return pending.promise;
    },
  );
  const material = new THREE.MeshStandardMaterial({ color: "#768765" });
  const fallback = material.color.clone();
  for (const path of [
    undefined,
    "https://example.com/texture.jpg",
    "//example.com/texture.jpg",
    "/images/materials/../texture.jpg",
    "/images/materials/%2e%2e/texture.jpg",
    "/images/materials/texture.svg",
    "/images/materials/texture.jpg?redirect=external",
  ])
    swatches.attach(material, path);
  assert.equal(requests, 0);
  swatches.attach(material, "/images/materials/vesto-roble.png");
  pending.reject(new Error("Not found"));
  await pending.promise.catch(() => {});
  assert.equal(requests, 1);
  assert.equal(material.map, null);
  assert.ok(material.color.equals(fallback));
  assert.equal(renders, 0);
  swatches.dispose();
});
