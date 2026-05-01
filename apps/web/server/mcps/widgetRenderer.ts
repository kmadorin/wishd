import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { randomUUID } from "node:crypto";

// Agent sometimes serializes nested objects as JSON strings on the tool-call
// path. Accept either an object or a JSON string and normalize to object.
const propsSchema = z
  .union([z.record(z.string(), z.any()), z.string()])
  .transform((v) => {
    if (typeof v === "string") {
      try {
        return JSON.parse(v) as Record<string, unknown>;
      } catch {
        throw new Error("props must be an object or valid JSON string");
      }
    }
    return v as Record<string, unknown>;
  })
  .describe("Props for the widget. Object preferred; JSON string also accepted.");

export function createWidgetRendererMcp(emit: (e: ServerEvent) => void) {
  return createSdkMcpServer({
    name: "widget",
    version: "0.0.0",
    tools: [
      tool(
        "render",
        "Render a widget into the user workspace. Use AFTER preparing data with a plugin tool.",
        {
          type: z.string().describe("Widget type, e.g. compound-summary, compound-execute"),
          props: propsSchema,
          slot: z.enum(["flow", "results", "pinned", "panel"]).optional().default("flow"),
        },
        async (args) => {
          const id = randomUUID();
          emit({
            type: "ui.render",
            widget: { id, type: args.type, slot: args.slot, props: args.props },
          });
          return { content: [{ type: "text", text: `rendered ${args.type} as ${id}` }] };
        },
      ),
    ],
  });
}
