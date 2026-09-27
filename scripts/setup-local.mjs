import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../.dev.vars", import.meta.url));
try {
  await access(target);
  console.log(
    "La configuración local ya existe en .dev.vars. Se conservaron las credenciales.",
  );
} catch {
  const password = randomBytes(24).toString("base64url");
  const secret = randomBytes(48).toString("base64url");
  await writeFile(
    target,
    `# Solo desarrollo local. Nunca subir este archivo a GitHub.\nADMIN_PASSWORD="${password}"\nSESSION_SECRET="${secret}"\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Configuración local creada en .dev.vars (excluido de Git).");
  console.log(`Contraseña local del administrador: ${password}`);
  console.log(
    "Guárdala en tu gestor de contraseñas. Esta contraseña solo pertenece a la muestra local.",
  );
}
