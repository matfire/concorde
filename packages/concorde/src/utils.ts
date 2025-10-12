import type { ChannelDef, DynamicChannel } from "./types.js";

/**
 * Type guard to check if a channel specifier is a static channel name
 */
// biome-ignore lint/suspicious/noExplicitAny: don't worry about it
export function isStaticChannel(channel: any): channel is string {
  return typeof channel === "string";
}

/**
 * Type guard to check if a channel specifier is a dynamic channel object
 */
export function isDynamicChannel(
  channel: ChannelDef | DynamicChannel<string>,
): channel is DynamicChannel<string> {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "template" in channel &&
    "params" in channel &&
    typeof channel.template === "string" &&
    typeof channel.params === "object"
  );
}

/**
 * Resolve a channel specifier to the actual channel name that will be used with Pusher
 */
export function resolveChannelName(
  channelSpec: string | DynamicChannel<string>,
): string {
  if (isStaticChannel(channelSpec)) {
    return channelSpec;
  }

  if (isDynamicChannel(channelSpec)) {
    return channelSpec.template.replace(
      /{(\w+)}/g,
      (_match: string, paramName: string): string => {
        const params = channelSpec.params as Record<string, string>;
        if (!(paramName in params)) {
          throw new Error(
            `Missing parameter: ${paramName} for template ${channelSpec.template}`,
          );
        }
        return params[paramName] || "";
      },
    );
  }

  throw new Error("Invalid channel specification");
}

/**
 * Get the channel definition from the registry for a given channel specifier
 */
export function getChannelDef<Registry extends Record<string, ChannelDef>>(
  registry: Registry,
  channelSpec: string | DynamicChannel<string>,
): ChannelDef {
  if (isStaticChannel(channelSpec)) {
    const def = (registry as Record<string, ChannelDef>)[channelSpec];
    if (!def) {
      throw new Error(`Could not find channel ${channelSpec}`);
    }
    return def;
  }

  if (isDynamicChannel(channelSpec)) {
    const def = registry[channelSpec.template];
    if (!def) {
      throw new Error(
        `Could not find channel template ${channelSpec.template}`,
      );
    }
    return def;
  }

  throw new Error("Invalid channel specification");
}

/**
 * Validate that all required parameters are provided for a dynamic channel template
 */
export function validateChannelParams(
  template: string,
  params: Record<string, string>,
): void {
  const requiredParams = [...template.matchAll(/{(\w+)}/g)].map(
    (match) => match[1],
  );

  for (const param of requiredParams) {
    if (param && !(param in params)) {
      throw new Error(
        `Missing required parameter: ${param} for template ${template}`,
      );
    }
    if (param && typeof params[param] !== "string") {
      throw new Error(
        `Parameter ${param} must be a string, got ${typeof params[param]}`,
      );
    }
  }
}

/**
 * Extract parameter names from a template string
 */
export function extractParameterNames(template: string): string[] {
  return [...template.matchAll(/{(\w+)}/g)]
    .map((match) => match[1])
    .filter((param): param is string => param !== undefined);
}

/**
 * Check if a template string has dynamic parameters
 */
export function hasTemplateParams(template: string): boolean {
  return /{(\w+)}/.test(template);
}
