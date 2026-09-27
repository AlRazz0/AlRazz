export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T = any>(action: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api/store" + (body ? "" : "?" + action),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "No se pudo conectar al servidor. Inténtalo otra vez.",
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      data.error || "No se pudo completar la operación.",
      response.status,
    );
  return data;
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
