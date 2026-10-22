/** Browser-only WebAuthn conversion. Secrets remain with the authenticator. */
export function decodeBase64URL(value: string): ArrayBuffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new Error("La solicitud de la llave no es válida. Vuelve a intentarlo.");
  const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
  return bytes.buffer;
}

export function encodeBase64URL(value: ArrayBuffer): string {
  let text = "";
  for (const byte of new Uint8Array(value)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function descriptor(item: PublicKeyCredentialDescriptorJSON): PublicKeyCredentialDescriptor {
  if (item.type !== "public-key") throw new Error("La solicitud de la llave no es válida.");
  const transports = item.transports?.filter((transport): transport is AuthenticatorTransport =>
    ["ble", "hybrid", "internal", "nfc", "usb"].includes(transport));
  return { type: "public-key", id: decodeBase64URL(item.id), transports };
}

function enumOption<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new Error("La solicitud de la llave no es válida.");
  return value as T;
}

function extensions(input: AuthenticationExtensionsClientInputsJSON | undefined): AuthenticationExtensionsClientInputs | undefined {
  if (!input) return undefined;
  const prfValues = (value: AuthenticationExtensionsPRFValuesJSON): AuthenticationExtensionsPRFValues => ({
    first: decodeBase64URL(value.first), second: value.second === undefined ? undefined : decodeBase64URL(value.second),
  });
  return {
    ...input,
    largeBlob: input.largeBlob ? { ...input.largeBlob, write: input.largeBlob.write === undefined ? undefined : decodeBase64URL(input.largeBlob.write) } : undefined,
    prf: input.prf ? {
      eval: input.prf.eval ? prfValues(input.prf.eval) : undefined,
      evalByCredential: input.prf.evalByCredential ? Object.fromEntries(Object.entries(input.prf.evalByCredential).map(([id, value]) => [id, prfValues(value)])) : undefined,
    } : undefined,
  };
}

export function creationOptions(options: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: decodeBase64URL(options.challenge),
    user: { ...options.user, id: decodeBase64URL(options.user.id) },
    attestation: enumOption(options.attestation, ["none", "indirect", "direct", "enterprise"] as const),
    extensions: extensions(options.extensions),
    excludeCredentials: options.excludeCredentials?.map(descriptor),
  };
}

export function requestOptions(options: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: decodeBase64URL(options.challenge),
    allowCredentials: options.allowCredentials?.map(descriptor),
    userVerification: enumOption(options.userVerification, ["required", "preferred", "discouraged"] as const),
    extensions: extensions(options.extensions),
  };
}

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials;
}

function publicCredential(credential: Credential | null): PublicKeyCredential {
  if (!credential || credential.type !== "public-key")
    throw new Error("No se completó la verificación de la llave. Puedes intentarlo de nuevo.");
  return credential as PublicKeyCredential;
}

export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON) {
  const credential = publicCredential(await navigator.credentials.create({ publicKey: creationOptions(options) }));
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id, rawId: encodeBase64URL(credential.rawId), type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: encodeBase64URL(response.clientDataJSON),
      attestationObject: encodeBase64URL(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

export async function usePasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  const credential = publicCredential(await navigator.credentials.get({ publicKey: requestOptions(options) }));
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id, rawId: encodeBase64URL(credential.rawId), type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: encodeBase64URL(response.clientDataJSON),
      authenticatorData: encodeBase64URL(response.authenticatorData),
      signature: encodeBase64URL(response.signature),
      userHandle: response.userHandle ? encodeBase64URL(response.userHandle) : null,
    },
  };
}

export function passkeyError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError")
      return "La verificación se canceló o venció. Puedes volver a intentarlo o elegir otro método.";
    if (error.name === "InvalidStateError")
      return "Esta llave ya está registrada. Usa otra llave o vuelve a tu lista.";
    if (error.name === "NotSupportedError")
      return "Este navegador o dispositivo no admite esta llave. Prueba con un navegador actualizado u otro método.";
    if (error.name === "SecurityError")
      return "Abre la dirección oficial del panel para utilizar tus llaves de acceso.";
    return "El dispositivo no pudo completar la operación con la llave. Vuelve a intentarlo.";
  }
  return error instanceof Error ? error.message : "No se pudo completar la operación con la llave.";
}
