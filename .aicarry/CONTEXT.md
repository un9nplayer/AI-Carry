# AI Carry — Context

This file describes the working context loaded at session start.

## Project Context Sources

AI Carry assembles the system context from multiple sources in this order:

1. **Base system prompt** — Mode-specific instructions (Plan or Build) with working directory
2. **AGENTS.md** — This file: agent behaviour rules from `.aicarry/AGENTS.md`
3. **Skills** — Any `.aicarry/skills/*.md` files (loaded by name via `/skill <name>`)
4. **Conversation history** — Full session history replayed each turn

## Session Behavior

- The model retains working directory awareness across all tool calls.
- In Plan mode the model reads files and asks questions. No tool calls are emitted.
- In Build mode the model executes tool calls immediately and iterates until the task is complete.
- Errors are retried automatically with an alternative approach.

## Extending Context

Add `.aicarry/skills/` files to inject reusable domain knowledge. Example:

```
.aicarry/
  AGENTS.md          ← always loaded
  CONTEXT.md         ← always loaded (this file)
  skills/
    pentest.md       ← load with /skill pentest
    python.md        ← load with /skill python
```
