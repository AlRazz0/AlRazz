import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  hashPassword,
  generateTotpSecret,
  createRecoveryCode,
  hashRecoveryCode,
} from "../lib/admin-crypto.ts";

const target = new URL("../.dev.vars", import.meta.url);
const existing = await readFile(target, "utf8").catch(() => "");
const values = Object.fromEntries(
  existing.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) return [];
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    else if (value.startsWith("'") && value.endsWith("'"))
      value = value.slice(1, -1);
    return [[match[1], value]];
  }),
);
const args = process.argv.slice(2);
const emailPosition = args.indexOf("--email");
const email = (
  emailPosition >= 0
    ? args[emailPosition + 1]
    : values.ADMIN_EMAIL || "admin@alrazz.test"
)
  ?.trim()
  .toLowerCase();
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Indica un correo válido después de --email.");
let password;
if (args.includes("--password-stdin")) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  password = input.replace(/[\r\n]+$/, "");
} else if (!values.ADMIN_PASSWORD_HASH)
  password = values.ADMIN_PASSWORD || randomBytes(24).toString("base64url");
if (password !== undefined && (password.length < 16 || password.length > 512))
  throw new Error("La contraseña debe tener entre 16 y 512 caracteres.");
const passwordHash =
  password !== undefined
    ? await hashPassword(password)
    : values.ADMIN_PASSWORD_HASH;
const resetMfa =
  args.includes("--reset-mfa") ||
  !values.ADMIN_TOTP_SECRET ||
  !values.ADMIN_RECOVERY_HASHES;
const totpSecret = resetMfa ? generateTotpSecret() : values.ADMIN_TOTP_SECRET;
const recoveryCodes = resetMfa
  ? Array.from({ length: 8 }, createRecoveryCode)
  : null;
const recoveryHashes = recoveryCodes
  ? JSON.stringify(recoveryCodes.map(hashRecoveryCode))
  : values.ADMIN_RECOVERY_HASHES;
const auth = {
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD_HASH: passwordHash,
  ADMIN_TOTP_SECRET: totpSecret,
  ADMIN_RECOVERY_HASHES: recoveryHashes,
  SESSION_SECRET:
    values.SESSION_SECRET?.length >= 32
      ? values.SESSION_SECRET
      : randomBytes(48).toString("base64url"),
};
const otherLines = existing
  .split(/\r?\n/)
  .filter(
    (line) =>
      !/^(ADMIN_PASSWORD|ADMIN_EMAIL|ADMIN_PASSWORD_HASH|ADMIN_TOTP_SECRET|ADMIN_RECOVERY_HASHES|SESSION_SECRET)=/.test(
        line.trim(),
      ),
  );
await writeFile(
  target,
  otherLines.join("\n").trimEnd() +
    "\n" +
    Object.entries(auth)
      .map(([key, value]) =>
        key === "ADMIN_RECOVERY_HASHES"
          ? `${key}='${value}'`
          : `${key}=${JSON.stringify(value)}`,
      )
      .join("\n") +
    "\n",
  { mode: 0o600 },
);
if (password !== undefined) {
  await writeFile(
    new URL("../.admin-credentials.txt", import.meta.url),
    `ALRAZZ — SOLO MUESTRA LOCAL\nCorreo: ${email}\nContraseña: ${password}\n\nPanel: http://localhost:5173/admin\nEl acceso también requiere tu autenticador; consulta .admin-mfa.txt.\nEsta cuenta no está desplegada ni verifica la propiedad del buzón.\nGuarda la contraseña en tu gestor y retira este archivo después.\n`,
    { mode: 0o600 },
  );
} else if (email !== values.ADMIN_EMAIL) {
  const credentialsPath = new URL("../.admin-credentials.txt", import.meta.url);
  const oldCredentials = await readFile(credentialsPath, "utf8").catch(
    () => "",
  );
  if (oldCredentials)
    await writeFile(
      credentialsPath,
      oldCredentials.replace(/^Correo:.*$/m, `Correo: ${email}`),
      { mode: 0o600 },
    );
}
if (recoveryCodes) {
  const uri = `otpauth://totp/${encodeURIComponent("AlRazz:" + email)}?secret=${totpSecret}&issuer=AlRazz&algorithm=SHA1&digits=6&period=30`;
  await writeFile(
    new URL("../.admin-mfa.txt", import.meta.url),
    `ALRAZZ — VINCULACIÓN LOCAL DEL AUTENTICADOR\n\nEn tu app autenticadora, añade una clave manual:\nCuenta: AlRazz (${email})\nClave: ${totpSecret}\nTipo: basada en tiempo, 6 dígitos, 30 segundos.\n\nURI de vinculación: ${uri}\n\nCÓDIGOS DE RECUPERACIÓN (cada uno sirve una vez, después de la contraseña):\n${recoveryCodes.join("\n")}\n\nGuárdalos en un lugar seguro separado de tu contraseña. Tras vincular el autenticador, retira este archivo. No reutilices estas credenciales en producción.\n`,
    { mode: 0o600 },
  );
}
console.log(
  "Acceso local preparado. Ningún secreto se muestra en la terminal.",
);
console.log(
  "Contraseña: .admin-credentials.txt · Vinculación y recuperación: .admin-mfa.txt (archivos excluidos de Git).",
);
console.log(
  "Reinicia npm run dev después de actualizar .dev.vars. Los catálogos y diseños se conservan.",
);
if (email.endsWith(".test"))
  console.log(
    "Se usa un correo reservado para la muestra. La cuenta definitiva requiere --email con el correo autorizado.",
  );
