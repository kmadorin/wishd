import { exchangeCode } from "@/server/keepers/khOAuth";

function htmlResponse(body: string, status = 200): Response {
  return new Response(`<!doctype html><html><body>${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return htmlResponse(`<script>
try { window.opener?.postMessage({type:"wishd:kh:auth-error",error:${JSON.stringify(error)}}, "*"); } catch(e) {}
</script><p>Authorization failed: ${error}</p><button onclick="window.close()">close</button>`);
  }

  if (!code || !state) {
    return htmlResponse(`<script>
try { window.opener?.postMessage({type:"wishd:kh:auth-error",error:"missing code or state"}, "*"); } catch(e) {}
</script><p>Missing parameters.</p><button onclick="window.close()">close</button>`, 400);
  }

  try {
    await exchangeCode({ code, state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return htmlResponse(`<script>
try { window.opener?.postMessage({type:"wishd:kh:auth-error",error:${JSON.stringify(msg)}}, "*"); } catch(e) {}
</script><p>Token exchange failed: ${msg}</p><button onclick="window.close()">close</button>`, 500);
  }

  return htmlResponse(`<script>
try { window.opener?.postMessage({type:"wishd:kh:authed"}, "*"); } catch(e) {}
window.close();
</script><p>KeeperHub connected. You can close this window.</p>`);
}
