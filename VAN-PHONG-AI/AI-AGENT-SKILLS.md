# AI Agent Skills

The runtime registry is a bounded integration of selected methods from
`claude-skills` (`alirezarezvani/claude-skills`). The full clone is kept as a
reference corpus under `claude-skills/`; it is not loaded wholesale into the
agent prompt.

## Runtime Skills

| ID | Upstream method | Runtime use |
| --- | --- | --- |
| `case-workflow` | `engineering/skills/agent-workflow-designer` | Sequential case steps, handoffs, validation and human gates |
| `knowledge-retrieval` | `engineering/skills/rag-architect` + `business-operations/skills/knowledge-ops` | Source-backed retrieval, freshness warnings and SOP hygiene |
| `procurement-review` | `business-operations/skills/procurement-optimizer` | Spend, quote and supplier comparison; recommendation only |
| `decision-record` | `ra-qm-team/skills/agent-decision-receipts` | Consequential-action manifest and confirmation gate |
| `prompt-quality` | `engineering/prompt-governance` + `engineering/skills/self-eval` | Schema checks, confidence, regression awareness and rollback advice |

## Runtime Contract

Every skill declares:

- `triggers`: deterministic routing terms;
- `can`: allowed operations;
- `cannot`: forbidden operations;
- `output`: required result concepts;
- `policy`: the safety and quality rule injected into the model prompt.

The agent must keep the following human-only actions outside the skill layer:

- signing or approving a document;
- accepting goods or confirming real-world completion;
- paying or transferring money;
- granting access;
- deleting or changing external data;
- selecting a final supplier where policy requires a human decision.

## API

`GET /api/ai/skills` returns the active runtime registry. `POST /api/ai/respond`
routes the request automatically, or accepts `skillId` when a caller has a
strong reason to select a skill explicitly. The response includes the selected
skill metadata, and case analysis stores that metadata in the dossier.

## Extension Rule

Add a new skill only when it has a concrete trigger, bounded permissions,
structured output, a human confirmation rule, and a test case. Do not expose
the upstream repository as an unrestricted prompt library.
