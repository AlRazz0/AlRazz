import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const publicExtensions = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp4",
  ".webm",
  ".glb",
  ".gltf",
  ".bin",
  ".wasm",
  ".txt",
  ".xml",
  ".webmanifest",
  ".pdf",
]);

async function publicFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      /^wrangler\./i.test(entry.name) ||
      ["_worker.js", "_routes.json"].includes(entry.name)
    )
      continue;
    if (entry.isSymbolicLink()) {
      throw new Error(
        "El frontend para Pages no puede contener enlaces simbólicos.",
      );
    }
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await publicFiles(join(directory, entry.name), path)));
    } else if (
      entry.isFile() &&
      publicExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files;
}

export async function preparePages(root = repository) {
  const base = await realpath(root);
  const dist = join(base, "dist");
  const source = join(dist, "client");
  const output = join(dist, "pages");
  for (const path of [dist, source]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error("Ejecuta el build con un directorio dist/client local.");
    }
  }
  const files = await publicFiles(source);
  if (!files.includes("index.html")) {
    throw new Error(
      "Falta dist/client/index.html. Ejecuta npm run build primero.",
    );
  }
  if (files.includes("404.html")) {
    throw new Error(
      "Pages necesita el fallback SPA: no debe existir un 404.html raíz.",
    );
  }
  // Resolve and check the exact generated target before removing stale assets.
  if (
    relative(base, output) !== join("dist", "pages") ||
    !output.startsWith(base + sep)
  ) {
    throw new Error("Destino de Pages fuera del directorio generado.");
  }
  const outputInfo = await lstat(output).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (outputInfo?.isSymbolicLink())
    throw new Error("dist/pages no puede ser un enlace simbólico.");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of files) {
    const target = join(output, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, file), target);
  }
  for (const file of ["_worker.js", "_routes.json"]) {
    await copyFile(join(base, "hosting", "pages", file), join(output, file));
  }
  return { output, assetCount: files.length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await preparePages();
  console.log(
    `Pages preparado: ${result.assetCount} archivos públicos en ${result.output}`,
  );
}
