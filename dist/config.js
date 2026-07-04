/**
 * OKF plugin configuration management
 */
/**
 * Default plugin configuration
 */
export const DEFAULT_CONFIG = {
    bundlePath: ".okf",
    autoRecall: false,
    maxRecallChars: 1000,
    maxRecallConcepts: 5,
    graphDepth: 1,
    watchChanges: true,
    autoCapture: false,
    autoCaptureMinChars: 500,
    autoCaptureTypes: ["decision", "playbook", "architecture", "service", "integration"],
    corpusSupplement: false,
};
/**
 * Merge user configuration with defaults
 */
export function resolveConfig(userConfig) {
    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
    };
}
/**
 * Validate configuration values
 */
export function validateConfig(config) {
    const errors = [];
    if (!config.bundlePath || config.bundlePath.trim() === "") {
        errors.push("bundlePath must not be empty");
    }
    if (config.maxRecallChars < 100 || config.maxRecallChars > 10000) {
        errors.push("maxRecallChars must be between 100 and 10000");
    }
    if (config.maxRecallConcepts < 1 || config.maxRecallConcepts > 20) {
        errors.push("maxRecallConcepts must be between 1 and 20");
    }
    if (config.graphDepth < 0 || config.graphDepth > 3) {
        errors.push("graphDepth must be between 0 and 3");
    }
    if (config.autoCaptureMinChars < 100 || config.autoCaptureMinChars > 5000) {
        errors.push("autoCaptureMinChars must be between 100 and 5000");
    }
    const validCaptureTypes = ["decision", "playbook", "architecture", "service", "integration"];
    for (const t of config.autoCaptureTypes) {
        if (!validCaptureTypes.includes(t)) {
            errors.push(`Invalid autoCaptureType: ${t}. Valid types: ${validCaptureTypes.join(", ")}`);
        }
    }
    return errors;
}
//# sourceMappingURL=config.js.map