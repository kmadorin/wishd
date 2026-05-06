import { handlePluginToolRoute } from "@wishd/plugin-sdk/routes";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return handlePluginToolRoute(req);
}
