import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("../dist/client/", import.meta.url)));
const html = await readFile(resolve(root, "index.html"), "utf8");
const entry = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"/i)?.[1];
if (!entry) throw Error("No se encontró la entrada JavaScript del cliente.");
const visited = new Set();
let bytes = 0;
let gzipBytes = 0;
async function visit(filename) {
  const path = resolve(filename);
  if (!path.startsWith(root + sep)) throw Error("La entrada contiene una importación fuera del cliente.");
  if (visited.has(path)) return;
  visited.add(path);
  const code = await readFile(path, "utf8");
  bytes += Buffer.byteLength(code);
  gzipBytes += gzipSync(code).length;
  // Only static imports are needed at startup. Product/admin/3D routes remain lazy.
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of source.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith(".")) await visit(resolve(dirname(path), specifier));
      else if (specifier.startsWith("/")) await visit(resolve(root, specifier.slice(1)));
      else throw Error("El cliente requiere una importación externa inesperada.");
    }
  }
}
await visit(resolve(root, entry.replace(/^\//, "")));
if (bytes > 350_000) throw Error(`La carga inicial supera el presupuesto de 350 KB (${bytes} bytes). Revisa las importaciones de portada y catálogo.`);
console.log(`Portada: ${bytes} bytes JS iniciales, ${gzipBytes} bytes gzip; ${visited.size} archivo(s) de entrada. Presupuesto 350 KB aprobado.`);
