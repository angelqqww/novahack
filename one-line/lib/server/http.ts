import { NextResponse } from "next/server";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Accepts "212", "#212" or "%23212". */
export function orderId(raw: string): string {
  const id = decodeURIComponent(raw);
  return id.startsWith("#") ? id : `#${id}`;
}
