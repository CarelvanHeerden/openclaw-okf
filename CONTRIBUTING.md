# Contributing to openclaw-okf

Thanks for your interest in contributing! This plugin brings structured knowledge management to OpenClaw via the Open Knowledge Format (OKF).

## Development Setup

```bash
git clone https://github.com/CarelvanHeerden/openclaw-okf.git
cd openclaw-okf
npm install
```

### Link to a local OpenClaw instance

```bash
openclaw plugins install --link .
openclaw gateway restart
```

Verify the plugin loaded:
```bash
openclaw plugins list --verbose | grep okf
```

### Run tests

```bash
npm test
```

## Project Structure

```
src/
├── index.ts       # Plugin entry point, hooks, CLI commands
├── indexer.ts      # Bundle scanner, file watcher, search index
├── parser.ts       # YAML frontmatter + markdown parser
├── recall.ts       # Auto-recall concept matching
├── capture.ts      # Auto-capture from agent responses
├── tools.ts        # Agent tools (okf_search, okf_read, etc.)
├── types.ts        # TypeScript type definitions
├── config.ts       # Configuration defaults and validation
└── validator.ts    # OKF spec compliance checker
```

## Making Changes

1. **Fork** the repo and create a feature branch
2. **Write tests** for any new functionality
3. **Follow existing code style** — TypeScript strict mode, ESM imports
4. **Update documentation** — README, USAGE.md, and inline JSDoc
5. **Test with a real OpenClaw instance** — `openclaw plugins install --link .`
6. **Submit a PR** with a clear description of what and why

## Code Guidelines

- Use `api.logger` (not `console.log`) for all plugin runtime logging
- `console.log` is OK in CLI command handlers only
- All agent tool parameters use plain JSON Schema objects (no typebox)
- Path validation must use allowlist approach for security
- Add timeout protection to all hooks (30s max)

## OKF Spec Compliance

This plugin implements OKF v0.1. When adding features:
- Ensure frontmatter fields match the [OKF spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- Required fields: `type`, plus content body
- Reserved filenames: `index.md`, `log.md` (not treated as concepts)
- Concept IDs are derived from file paths (relative to bundle root, no `.md` extension)

## Reporting Issues

Open an issue on GitHub with:
- OpenClaw version (`openclaw --version`)
- Plugin version
- Steps to reproduce
- Expected vs actual behavior
- Relevant gateway logs (`grep -i okf` from gateway output)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
