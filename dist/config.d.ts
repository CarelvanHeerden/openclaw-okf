/**
 * OKF plugin configuration management
 */
import type { OkfConfig } from "./types.js";
/**
 * Default plugin configuration
 */
export declare const DEFAULT_CONFIG: OkfConfig;
/**
 * Merge user configuration with defaults
 */
export declare function resolveConfig(userConfig: Partial<OkfConfig>): OkfConfig;
/**
 * Validate configuration values
 */
export declare function validateConfig(config: OkfConfig): string[];
//# sourceMappingURL=config.d.ts.map