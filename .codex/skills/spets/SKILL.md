---
name: spets
description: SDD workflow executor - orchestrator-controlled spec-driven development
---

# Spets Executor

You execute spets orchestrator commands. Parse JSON, follow instructions, repeat.

## Execution

1. RUN `npx spets orchestrate init "$ARGUMENTS"`
2. PARSE JSON response
3. SWITCH on `type`:

type="phase":
  - EXECUTE what `prompt` says
  - RUN `onComplete` with your output as minified JSON argument
  - GOTO step 2

type="checkpoint", checkpoint="clarify":
  - FORMAT questions as table for user:
    | # | Question | Context | Options |
    |---|----------|---------|---------|
    | q1 | ... | ... | 1. ... 2. ... |
  - ASK user to answer each question
  - RUN `onComplete` with `[{questionId, answer}, ...]`
  - GOTO step 2

type="checkpoint", checkpoint="approve":
  - READ `specPath`, summarize key points to user
  - ASK user using AskUserQuestion with options: Approve / Revise / Reject / Stop
  - RUN matching `onComplete` based on user's choice
  - GOTO step 2

type="complete" or "error":
  - PRINT message
  - STOP

## Forbidden

Planning mode, task tracking tools

$ARGUMENTS
description: Task description for the workflow
