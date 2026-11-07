import { getState } from "@/lib/store";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return json(getState());
}
