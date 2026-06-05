import { cookies } from "next/headers";

import { createApiClient } from "@/lib/api";

export const serverApi = createApiClient(async (): Promise<HeadersInit> => {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader ? { Cookie: cookieHeader } : {};
});
