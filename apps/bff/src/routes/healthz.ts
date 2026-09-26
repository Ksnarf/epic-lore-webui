import type { FastifyInstance } from "fastify";
import type { HealthzResponse } from "@epic-lore-webui/api-types";

export function registerHealthzRoute(app: FastifyInstance): void {
  app.get("/healthz", async (): Promise<HealthzResponse> => {
    return {
      status: "ok",
      service: "epic-lore-webui-bff",
      timestamp: new Date().toISOString(),
    };
  });
}
