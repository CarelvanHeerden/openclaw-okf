# Auto-Recall Reference

## How Auto-Recall Works

When `autoRecall: true` (default), the OKF plugin automatically injects relevant concepts into the agent's context before each turn.

### Recall Pipeline

1. **Extract keywords** from the inbound message
2. **Search the OKF index** using keyword matching against titles, tags, and body text
3. **Rank matches** by relevance score
4. **Graph traversal** — follow markdown body links up to `graphDepth` hops to pull in related concepts
5. **Budget enforcement** — trim to `maxRecallConcepts` (default 5) and `maxRecallChars` (default 1000)
6. **Inject** into the agent turn as `## Relevant Knowledge (OKF)` block

### Tuning Recall

| Config | Default | Effect |
|---|---|---|
| `autoRecall` | `true` | Master switch for auto-injection |
| `maxRecallConcepts` | `5` | Max concepts per turn (1–20) |
| `maxRecallChars` | `1000` | Total character budget for injected context (100–10000) |
| `graphDepth` | `1` | Link traversal hops (0 = no traversal, max 3) |

### Tips

- **Too much noise?** Lower `maxRecallConcepts` to 2–3, or reduce `maxRecallChars`
- **Missing relevant context?** Increase `graphDepth` to 2 or raise `maxRecallChars`
- **Competing with hybrid-memory?** If both plugins inject context, consider setting `autoRecall: false` on OKF and using `corpusSupplement: true` instead — this lets hybrid-memory control the recall budget while still searching OKF content
- **Tag strategy matters** — well-chosen tags dramatically improve recall precision

### Corpus Supplement Mode

When `corpusSupplement: true`, OKF exposes `okf_corpus_search` which hybrid-memory can call during its own recall phase. This avoids double-injection and lets one system manage the context budget.

Use this when:
- Both OKF and hybrid-memory are active
- You want unified recall rather than two separate injections
- Context window budget is tight
