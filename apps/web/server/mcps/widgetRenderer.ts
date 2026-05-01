import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { randomUUID } from "node:crypto";

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
          props: z.record(z.string(), z.any()).describe("Props for the widget."),
          slot: z.enum(["flow", "results", "pinned", "panel"]).optional().default("flow"),
        },
        async (args) => {
          const id = randomUUID();
          emit({
            type: "ui.render",
            widget: { id, type: args.type, slot: args.slot, props: args.props as Record<string, unknown> },
          });
          return { content: [{ type: "text", text: `rendered ${args.type} as ${id}` }] };
        },
      ),
    ],
  });
}
