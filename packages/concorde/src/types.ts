// types.ts
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * A StandardSchema aware channel definition.
 * Consumers build a registry keyed by channel name.
 */
export type ChannelDef<
  Name extends string = string,
  Events extends Record<string, StandardSchemaV1> = Record<
    string,
    StandardSchemaV1
  >,
> = {
  name: Name;
  events: Events; // event -> schema
};

/**
 * Extract parameters from a template string like "user-{userId}-chat-{chatId}"
 * Returns an object type with the parameter names as keys
 */
export type ExtractParams<T extends string> =
  T extends `${string}{${infer P}}${infer Rest}`
    ? { [K in P]: string } & ExtractParams<Rest>
    : // biome-ignore lint/complexity/noBannedTypes: don't worry about it
      {};

/**
 * Check if a template string has dynamic parameters
 */
// biome-ignore lint/complexity/noBannedTypes: don't worry about it
export type HasParams<T extends string> = ExtractParams<T> extends {}
  ? keyof ExtractParams<T> extends never
    ? false
    : true
  : false;

/**
 * Dynamic channel specification for channels with template parameters
 */
export type DynamicChannel<Template extends string> = {
  template: Template;
  params: ExtractParams<Template>;
};

/**
 * Type for dynamic channel specifications within a registry
 */
export type DynamicChannelSpec<Registry> = Registry extends Record<
  string,
  ChannelDef
>
  ? {
      [K in keyof Registry]: HasParams<K & string> extends true
        ? DynamicChannel<K & string>
        : never;
    }[keyof Registry]
  : never;

/**
 * Helper to extract static channel names from a registry (no template parameters).
 */
export type StaticChannelNames<T> = T extends Record<string, ChannelDef>
  ? {
      [K in keyof T]: HasParams<K & string> extends false ? K : never;
    }[keyof T] &
      string
  : never;

/**
 * Helper to extract dynamic channel names from a registry (with template parameters).
 */
export type DynamicChannelNames<T> = T extends Record<string, ChannelDef>
  ? {
      [K in keyof T]: HasParams<K & string> extends true ? K : never;
    }[keyof T] &
      string
  : never;

/**
 * Helper to extract all channel names from a registry (both static and dynamic templates).
 */
export type ChannelNames<T> = T extends Record<string, ChannelDef>
  ? keyof T & string
  : never;

/**
 * Channel specifier - can be either a static channel name or a dynamic channel object
 */
export type ChannelSpecifier<Registry> =
  | StaticChannelNames<Registry>
  | DynamicChannelSpec<Registry>;

/**
 * Resolve channel specifier to template name for registry lookup
 */
export type ResolveChannelTemplate<Registry, ChSpec> = ChSpec extends string
  ? ChSpec extends keyof Registry
    ? ChSpec
    : never
  : ChSpec extends DynamicChannel<infer Template>
    ? Template extends keyof Registry
      ? Template
      : never
    : never;

/**
 * Helper to extract the event names for a given channel specifier.
 */
export type EventNames<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>,
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<
      string,
      infer Ev
    >
    ? keyof Ev & string
    : never
  : never;

/**
 * Helper to extract the *input* TS type for a given channel+event
 * (what users pass to `.trigger`).
 */
export type InType<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>,
  Ev extends EventNames<Registry, ChSpec>,
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<
      string,
      infer E
    >
    ? Ev extends keyof E
      ? E[Ev] extends StandardSchemaV1
        ? StandardSchemaV1.InferInput<E[Ev]>
        : never
      : never
    : never
  : never;

/**
 * Helper to extract the *output* TS type for a given channel+event
 * (what users receive in `.bind` callbacks).
 */
export type OutType<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>,
  Ev extends EventNames<Registry, ChSpec>,
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<
      string,
      infer E
    >
    ? Ev extends keyof E
      ? E[Ev] extends StandardSchemaV1
        ? StandardSchemaV1.InferOutput<E[Ev]>
        : never
      : never
    : never
  : never;
