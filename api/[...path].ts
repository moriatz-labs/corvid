import { app } from "../server/app";
import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.url?.startsWith("/api/webhooks/")) {
    request.url = request.url.replace(/^\/api\/webhooks/, "/webhooks");
  }

  return app(request, response);
}
