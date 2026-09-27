export interface MailEnv {
  RESEND_API_KEY?: string;
  ADMIN_EMAIL_FROM?: string;
}

export function emailAvailable(env: MailEnv): boolean {
  return !!(
    env.RESEND_API_KEY?.trim() &&
    env.ADMIN_EMAIL_FROM?.trim() &&
    !/[\r\n]/.test(env.ADMIN_EMAIL_FROM)
  );
}

export async function sendLoginCode(
  env: MailEnv,
  recipient: string,
  code: string,
  idempotencyKey: string,
): Promise<boolean> {
  if (!emailAvailable(env)) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `alrazz-${idempotencyKey}`,
      },
      body: JSON.stringify({
        from: env.ADMIN_EMAIL_FROM,
        to: [recipient],
        subject: "Código de acceso a AlRazz",
        text: `Tu código de verificación de AlRazz es ${code}.\n\nSolo sirve para el inicio de sesión que acabas de solicitar y vence en un máximo de 5 minutos. No lo compartas. Si no solicitaste el acceso, cambia tu contraseña administrativa.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    // Provider bodies can contain personal data; never return or log them.
    return response.ok;
  } catch {
    return false;
  }
}
