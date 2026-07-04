/**
 * OKF (Open Knowledge Format) plugin for OpenClaw
 *
 * Provides structured knowledge bundles with auto-recall, graph traversal, and agent tools.
 * Based on OKF v0.1 spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveConfig, validateConfig } from "./config.js";
import { buildIndex, watchBundle } from "./indexer.js";
import { recallConcepts } from "./recall.js";
import { detectKeywordTrigger, analyzeForAutoCapture } from "./capture.js";
import { okfSearchTool, okfReadTool, okfWriteTool, okfListTool, okfValidateTool, } from "./tools.js";
/**
 * Plugin state
 */
let currentIndex = null;
let bundleWatchCleanup = null;
let isReindexing = false;
let reindexTimer = null;
export default definePluginEntry({
    id: "openclaw-okf",
    name: "OKF (Open Knowledge Format)",
    description: "Structured knowledge bundles with auto-recall, graph traversal, and agent tools",
    register(api) {
        const config = resolveConfig(api.pluginConfig);
        // Resolve workspace directory: try api.config, then known paths, then cwd
        const candidateDirs = [
            api.config?.workspaceDir,
            process.env.OPENCLAW_WORKSPACE,
            join(process.env.HOME || "", ".openclaw", "workspace"),
            process.cwd(),
        ].filter(Boolean);
        // Bug E fix: prefer HOME/.openclaw/workspace as default, not process.cwd()
        // process.cwd() resolves to /app in containerised gateways, which is wrong
        const homeWorkspace = join(process.env.HOME || "", ".openclaw", "workspace");
        let workspaceDir = existsSync(homeWorkspace) ? homeWorkspace : candidateDirs[0] || process.cwd();
        for (const candidate of candidateDirs) {
            const testPath = join(candidate, config.bundlePath);
            if (existsSync(testPath)) {
                workspaceDir = candidate;
                break;
            }
        }
        api.logger.info(`OKF workspace candidates: ${JSON.stringify(candidateDirs)}, resolved: ${workspaceDir}`);
        const bundlePath = join(workspaceDir, config.bundlePath);
        // Validate configuration
        const configErrors = validateConfig(config);
        if (configErrors.length > 0) {
            api.logger.error("Invalid OKF configuration:", configErrors);
            return;
        }
        api.logger.info(`OKF plugin initializing with bundle path: ${bundlePath}`);
        /**
         * Trigger a reindex of the bundle
         */
        const triggerReindex = async () => {
            if (isReindexing)
                return;
            isReindexing = true;
            try {
                api.logger.info("Reindexing OKF bundle...");
                currentIndex = await buildIndex(bundlePath, config, api.logger);
                api.logger.info(`OKF index built: ${currentIndex.concepts.size} concepts indexed`);
            }
            catch (error) {
                api.logger.error("Failed to build OKF index:", error);
                currentIndex = null;
            }
            finally {
                isReindexing = false;
            }
        };
        /**
         * Schedule a reindex with debounce to prevent race conditions
         */
        const scheduleReindex = () => {
            if (reindexTimer)
                clearTimeout(reindexTimer);
            reindexTimer = setTimeout(() => triggerReindex(), 1000);
        };
        /**
         * Initialize index and watcher.
         * Bug D fix: run inline during register() so hot-reload works,
         * not only on gateway_start (which doesn't re-fire for late installs).
         */
        const initializeBundle = async () => {
            await triggerReindex();
            // Set up file watcher if enabled
            if (config.watchChanges && currentIndex) {
                try {
                    bundleWatchCleanup = await watchBundle(bundlePath, () => {
                        api.logger.info("OKF bundle changed, triggering reindex...");
                        scheduleReindex();
                    }, api.logger);
                    api.logger.info("OKF bundle file watcher started");
                }
                catch (error) {
                    api.logger.warn("Failed to start bundle watcher:", error);
                }
            }
        };
        // Kick off initialization immediately (handles hot-reload + fresh install)
        const startupPromise = initializeBundle();
        // Also listen for gateway_start to ensure we're ready (handles cold start)
        api.on("gateway_start", async () => {
            await startupPromise;
        });
        /**
         * Gateway stop hook - cleanup watcher
         */
        api.on("gateway_stop", async () => {
            if (bundleWatchCleanup) {
                bundleWatchCleanup();
                bundleWatchCleanup = null;
                api.logger.info("OKF bundle file watcher stopped");
            }
        });
        /**
         * Before prompt build hook - auto-recall relevant concepts
         * AND detect keyword triggers for OKF writes
         */
        api.on("before_prompt_build", async (event) => {
            const contextParts = [];
            // Keyword trigger detection (Option 2 - always active)
            if (event.prompt) {
                const trigger = detectKeywordTrigger(event.prompt);
                if (trigger.triggered) {
                    contextParts.push(`[OKF] The user used a knowledge-base trigger phrase ("${trigger.matchedTrigger}"). ` +
                        `Use the okf_write tool to save this as a structured OKF concept. ` +
                        `Choose an appropriate type (Decision, Playbook, Service, etc.), ` +
                        `path, and cross-link to related concepts.`);
                }
            }
            // Auto-recall (Option 1 - only when config.autoRecall is true)
            if (currentIndex && config.autoRecall) {
                try {
                    const recalledContext = await recallConcepts(currentIndex, event.prompt, config);
                    if (recalledContext) {
                        contextParts.push(recalledContext);
                    }
                }
                catch (error) {
                    api.logger.error("OKF auto-recall failed:", error);
                }
            }
            if (contextParts.length > 0) {
                return {
                    appendContext: contextParts.join("\n\n"),
                };
            }
        }, { priority: 40, timeoutMs: 3000 });
        /**
         * Agent end hook - auto-capture knowledge (Option 3 - feature flagged)
         * Only active when config.autoCapture is true (defaults to false).
         *
         * Analyzes completed turns for documentable knowledge and logs
         * suggestions. Does NOT auto-write concepts — it injects a suggestion
         * into the next turn so the agent can decide whether to write.
         */
        if (config.autoCapture) {
            api.logger.info("OKF auto-capture enabled (feature flag)");
            api.on("agent_end", async (event) => {
                if (!currentIndex)
                    return;
                try {
                    // Safely extract user message and assistant response
                    const userMessage = typeof event.prompt === "string" ? event.prompt : "";
                    if (!userMessage)
                        return;
                    // Guard against malformed event structure
                    const messages = Array.isArray(event.messages) ? event.messages : [];
                    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                    if (!lastMessage)
                        return;
                    const assistantResponse = typeof lastMessage.content === "string"
                        ? lastMessage.content
                        : "";
                    if (!assistantResponse)
                        return;
                    const analysis = analyzeForAutoCapture(userMessage, assistantResponse, config);
                    if (analysis.shouldCapture) {
                        api.logger.info(`OKF auto-capture suggestion: ${analysis.knowledgeType} -> ${analysis.suggestedPath}`);
                        // Note: We log the suggestion but don't auto-write.
                        // A future enhancement could queue this for the next turn's
                        // before_prompt_build to suggest the agent document it.
                    }
                }
                catch (error) {
                    api.logger.warn("OKF auto-capture analysis failed:", error);
                }
            }, { priority: 20, timeoutMs: 2000 });
        }
        /**
         * Register agent tools
         */
        // okf_search
        api.registerTool({
            ...okfSearchTool,
            async execute(_id, params) {
                if (!currentIndex) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "OKF index not yet built. Please wait for initialization to complete.",
                            },
                        ],
                    };
                }
                return okfSearchTool.execute(_id, params, { index: currentIndex });
            },
        });
        // okf_read
        api.registerTool({
            ...okfReadTool,
            async execute(_id, params) {
                if (!currentIndex) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "OKF index not yet built. Please wait for initialization to complete.",
                            },
                        ],
                    };
                }
                return okfReadTool.execute(_id, params, {
                    index: currentIndex,
                    bundlePath,
                });
            },
        });
        // okf_write
        api.registerTool({
            ...okfWriteTool,
            async execute(_id, params) {
                return okfWriteTool.execute(_id, params, {
                    bundlePath,
                    reindexCallback: scheduleReindex,
                });
            },
        });
        // okf_list
        api.registerTool({
            ...okfListTool,
            async execute(_id, params) {
                if (!currentIndex) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "OKF index not yet built. Please wait for initialization to complete.",
                            },
                        ],
                    };
                }
                return okfListTool.execute(_id, params, { index: currentIndex });
            },
        });
        // okf_validate
        api.registerTool({
            ...okfValidateTool,
            async execute(_id, params) {
                if (!currentIndex) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "OKF index not yet built. Please wait for initialization to complete.",
                            },
                        ],
                    };
                }
                return okfValidateTool.execute(_id, params, {
                    bundlePath,
                    index: currentIndex,
                });
            },
        });
        /**
         * Register CLI commands
         */
        api.registerCli(({ program }) => {
            const okf = program
                .command("okf")
                .description("Manage OKF (Open Knowledge Format) knowledge bundles");
            okf
                .command("list")
                .description("List all concepts in the OKF bundle")
                .option("-d, --directory <path>", "Filter by directory")
                .option("-t, --type <type>", "Filter by concept type")
                .action(async (options) => {
                if (!currentIndex) {
                    console.error("OKF index not built. Run 'openclaw okf index' first.");
                    process.exit(1);
                }
                let concepts = Array.from(currentIndex.concepts.values());
                if (options.directory) {
                    const prefix = options.directory.endsWith("/")
                        ? options.directory
                        : `${options.directory}/`;
                    concepts = concepts.filter((c) => c.id.startsWith(prefix) || c.id === options.directory);
                }
                if (options.type) {
                    concepts = concepts.filter((c) => c.type === options.type);
                }
                console.log(`\nFound ${concepts.length} concept(s):\n`);
                for (const concept of concepts.sort((a, b) => a.id.localeCompare(b.id))) {
                    console.log(`- ${concept.title} (${concept.id})`);
                    console.log(`  Type: ${concept.type}`);
                    if (concept.description) {
                        console.log(`  ${concept.description}`);
                    }
                    console.log();
                }
            });
            okf
                .command("search")
                .description("Search for concepts in the OKF bundle")
                .argument("<query>", "Search query")
                .option("-t, --type <type>", "Filter by concept type")
                .option("-l, --limit <number>", "Maximum results", "10")
                .action(async (query, options) => {
                if (!currentIndex) {
                    console.error("OKF index not built. Run 'openclaw okf index' first.");
                    process.exit(1);
                }
                const { search } = await import("./indexer.js");
                const results = search(currentIndex, query, options.type);
                const limit = parseInt(options.limit, 10);
                const topResults = results.slice(0, limit);
                console.log(`\nFound ${topResults.length} concept(s) matching "${query}":\n`);
                for (const result of topResults) {
                    const concept = currentIndex.concepts.get(result.conceptId);
                    if (!concept)
                        continue;
                    console.log(`- ${concept.title} (${concept.id})`);
                    console.log(`  Type: ${concept.type}`);
                    console.log(`  Score: ${result.score.toFixed(2)}`);
                    if (concept.description) {
                        console.log(`  ${concept.description}`);
                    }
                    console.log();
                }
            });
            okf
                .command("validate")
                .description("Validate OKF bundle conformance to spec")
                .option("-p, --path <path>", "Specific concept path to validate")
                .action(async (options) => {
                if (!currentIndex) {
                    console.error("OKF index not built. Run 'openclaw okf index' first.");
                    process.exit(1);
                }
                const { validateBundle } = await import("./validator.js");
                const result = await validateBundle(bundlePath, currentIndex, options.path);
                if (result.valid) {
                    console.log("✅ Bundle validation passed!");
                    console.log(`\nValidated ${currentIndex.concepts.size} concept(s).`);
                }
                else {
                    console.log("❌ Bundle validation failed!\n");
                }
                if (result.errors.length > 0) {
                    console.log(`\nErrors (${result.errors.length}):`);
                    for (const error of result.errors) {
                        console.log(`  - ${error.message}`);
                        if (error.conceptId) {
                            console.log(`    Concept: ${error.conceptId}`);
                        }
                    }
                }
                if (result.warnings.length > 0) {
                    console.log(`\nWarnings (${result.warnings.length}):`);
                    for (const warning of result.warnings) {
                        console.log(`  - ${warning.message}`);
                        if (warning.conceptId) {
                            console.log(`    Concept: ${warning.conceptId}`);
                        }
                    }
                }
                process.exit(result.valid ? 0 : 1);
            });
            okf
                .command("stats")
                .description("Show OKF bundle statistics")
                .action(() => {
                if (!currentIndex) {
                    console.error("OKF index not built. Run 'openclaw okf index' first.");
                    process.exit(1);
                }
                const typeCount = new Map();
                for (const concept of currentIndex.concepts.values()) {
                    typeCount.set(concept.type, (typeCount.get(concept.type) || 0) + 1);
                }
                console.log("\nOKF Bundle Statistics:");
                console.log(`  Bundle path: ${bundlePath}`);
                console.log(`  Total concepts: ${currentIndex.concepts.size}`);
                console.log(`  Last indexed: ${new Date(currentIndex.indexedAt).toISOString()}`);
                console.log("\nConcepts by type:");
                for (const [type, count] of Array.from(typeCount.entries()).sort((a, b) => b[1] - a[1])) {
                    console.log(`  - ${type}: ${count}`);
                }
            });
            okf
                .command("index")
                .description("Rebuild the OKF bundle index")
                .action(async () => {
                console.log("Rebuilding OKF index...");
                await triggerReindex();
                if (currentIndex) {
                    console.log(`✅ Index rebuilt: ${currentIndex.concepts.size} concepts indexed`);
                }
                else {
                    console.error("❌ Failed to rebuild index");
                    process.exit(1);
                }
            });
        }, {
            descriptors: [
                {
                    name: "okf",
                    description: "Manage OKF (Open Knowledge Format) knowledge bundles",
                    hasSubcommands: true,
                },
            ],
        });
    },
});
//# sourceMappingURL=index.js.map