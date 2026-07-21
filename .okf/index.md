---
okf_version: "0.1"
---

# openclaw-okf Knowledge Base

Example OKF bundle for the openclaw-okf plugin. It documents the plugin
itself and doubles as a spec-conformant reference bundle: the root `index.md`
carries only the `okf_version` declaration, concepts live in subdirectories,
and cross-links are standard markdown links.

## Architecture

* [Plugin Overview](architecture/plugin-overview.md) - how the plugin registers with OpenClaw and what each module does

## Decisions

* [001: OKF Spec Alignment](decisions/001-spec-alignment.md) - why v0.3.0 relaxed validation and moved cross-links to body markdown

## Playbooks

* [Release Process](playbooks/release.md) - how to cut and publish a release of this plugin
