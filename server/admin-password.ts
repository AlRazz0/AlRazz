import { DurableObject } from "cloudflare:workers";
import {
  equalStrings,
  sha256,
  validPasswordHash,
  verifyPassword,
} from "../lib/admin-crypto.ts";

interface PasswordVerifierEnv {
  ADMIN_PASSWORD_HASH?: string;
}

// SQLite-backed Durable Objects have their own CPU allowance on Workers Free.
// This object exposes only an internal RPC method, with no HTTP route or storage.
export class AdminPasswordVerifier extends DurableObject<PasswordVerifierEnv> {
  async verify(
    password: string,
    expectedHashFingerprint: string,
  ): Promise<boolean> {
    if (
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 512 ||
      typeof expectedHashFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(expectedHashFingerprint)
    ) {
      throw new Error("Password verification unavailable.");
    }

    const encoded = this.env.ADMIN_PASSWORD_HASH;
    if (
      !encoded ||
      !validPasswordHash(encoded) ||
      !equalStrings(sha256(encoded), expectedHashFingerprint)
    ) {
      // Fail closed if the caller and object have different deployment secrets.
      throw new Error("Password verification unavailable.");
    }

    return verifyPassword(password, encoded);
  }
}
