# Capture Heuristics Reference

## When to Capture Knowledge to OKF

### Strong Signals (Capture)

- User explicitly says "document this", "add to knowledge base", "save this decision"
- Architecture discussion with concrete components, flows, or design choices
- A decision was made with rationale — "we chose X because Y"
- Procedure or runbook was created or refined
- API endpoint, schema, or integration was designed or documented
- User shares a repo, wiki, or doc URL for reference

### Weak Signals (Maybe Capture — Ask First)

- Lengthy technical discussion that *might* contain documentable knowledge
- User describes a system but hasn't asked to document it
- Troubleshooting session that revealed useful patterns
- Configuration discovered through trial and error

### No-Capture Signals (Never)

- Casual conversation, greetings, small talk
- Model reasoning traces or chain-of-thought artifacts
- Temporary debugging output
- Sensitive data (credentials, PII) — reference only, never store values
- One-off questions with no lasting value

## Auto-Capture Decision Flow

```
Inbound message received
  │
  ├─ autoCapture enabled? ─── No ──→ Skip
  │
  ├─ Response length > autoCaptureMinChars? ─── No ──→ Skip
  │
  ├─ User intent signal present? ─── No ──→ Skip
  │   (asking to document, sharing for reference,
  │    discussing architecture/decisions)
  │
  ├─ Assistant content signal present? ─── No ──→ Skip
  │   (structured knowledge, not reasoning/chat)
  │
  ├─ Content type in autoCaptureTypes? ─── No ──→ Skip
  │
  └─ ✅ Suggest capture to user (never auto-write without consent)
```

## Concept Splitting Strategy

When capturing from large sources:

1. **One concept per file** — atomic knowledge units
2. **Max ~500 lines** — split larger topics into sub-concepts
3. **Preserve hierarchy** — if the source has sections, map them to a directory structure
4. **Cross-link generously** — use `links:` to connect related concepts
5. **ID naming** — use path-style IDs: `domain/specific-topic` (e.g., `architecture/auth-flow`)

## Type Selection Guide

| Source Content | OKF Type |
|---|---|
| System design docs | `Architecture` |
| REST/GraphQL specs | `API Endpoint` |
| Database schemas | `Data Model` |
| Microservice docs | `Service` |
| Docker/K8s configs | `Infrastructure` |
| Runbooks/procedures | `Playbook` |
| Shell/Python scripts | `Script` |
| "Why we chose X" | `Decision Record` |
| Third-party API setup | `Integration` |
| Env vars, config files | `Configuration` |
| DR/rollback guides | `Recovery Procedure` |
