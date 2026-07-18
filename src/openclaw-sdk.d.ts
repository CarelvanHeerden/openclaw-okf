/**
 * Minimal ambient type declarations for the OpenClaw plugin SDK.
 *
 * The gateway provides `openclaw/plugin-sdk/plugin-entry` at runtime, but it is
 * not a build-time dependency of this plugin. Rather than vendoring the entire
 * gateway SDK, we declare the small surface this plugin actually uses so the
 * TypeScript build (`npm run build`) is clean and type-safe. If the SDK is ever
 * added as a real dependency, delete this file and import its types directly.
 */
declare module "openclaw/plugin-sdk/plugin-entry" {
  /** Logger passed to the plugin (matches the console-like gateway logger). */
  export interface PluginLogger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug?(message: string, ...args: unknown[]): void;
  }

  /** A single hook event. Fields are hook-specific; kept permissive. */
  export interface PluginHookEvent {
    prompt?: string;
    messages?: unknown;
    [key: string]: unknown;
  }

  /** Return shape for the `before_prompt_build` hook. */
  export interface HookResult {
    appendContext?: string;
    [key: string]: unknown;
  }

  /** Options accepted when registering a hook. */
  export interface HookOptions {
    priority?: number;
    timeoutMs?: number;
  }

  /** A registrable tool (structural — the plugin spreads its own tool objects). */
  export interface PluginTool {
    name: string;
    execute: (...args: any[]) => unknown;
    [key: string]: unknown;
  }

  /** Commander-style command builder handed to `registerCli`. */
  export interface CliProgram {
    command(name: string): CliProgram;
    description(text: string): CliProgram;
    argument(name: string, description?: string): CliProgram;
    option(flags: string, description?: string, defaultValue?: string): CliProgram;
    action(handler: (...args: any[]) => unknown): CliProgram;
  }

  /** Descriptor metadata optionally supplied alongside a CLI registration. */
  export interface CliCommandDescriptor {
    name: string;
    description?: string;
    hasSubcommands?: boolean;
    [key: string]: unknown;
  }

  export interface CliRegistration {
    descriptors?: CliCommandDescriptor[];
    [key: string]: unknown;
  }

  /** The API object passed to a plugin's `register(api)` method. */
  export interface PluginApi {
    logger: PluginLogger;
    /** Gateway-level config (workspace dir, etc.). */
    config?: { workspaceDir?: string; [key: string]: unknown };
    /** This plugin's resolved configuration block. */
    pluginConfig?: unknown;
    on(
      event: string,
      handler: (event: any) => unknown,
      options?: HookOptions
    ): void;
    registerTool(tool: PluginTool): void;
    registerCli(
      setup: (ctx: { program: CliProgram }) => void,
      registration?: CliRegistration
    ): void;
  }

  export interface PluginDefinition {
    id: string;
    name: string;
    description?: string;
    register(api: PluginApi): void | Promise<void>;
  }

  export function definePluginEntry(def: PluginDefinition): PluginDefinition;
}
