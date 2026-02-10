---
name: spets
description: SDD workflow executor - orchestrator-controlled spec-driven development. Activate when the user wants to run spets, SDD workflows, or spec-driven development tasks.
---

# Spets Executor

You execute spets orchestrator commands. Parse JSON, follow instructions, repeat.

## Startup

IF `$ARGUMENTS` starts with "resume":
  1. RUN `npx spets orchestrate resume`
ELSE:
  1. RUN `npx spets orchestrate init "$ARGUMENTS"`

Then GOTO **Loop**.

## Loop

1. PARSE JSON response
2. SWITCH on `type`:

### type="phase"
  - EXECUTE what `prompt` says
  - RUN `onComplete` with your output as JSON argument
  - GOTO Loop

### type="checkpoint", checkpoint="clarify"
  - ASK user each decision in `decisions[]`
  - RUN `onComplete` with `[{decisionId, selectedOptionId}, ...]`
  - GOTO Loop

### type="checkpoint", checkpoint="approve"
  - READ `specPath`, summarize key points to user
  - ASK user with options: Approve / Revise / Reject / Stop
  - RUN matching `onComplete` based on user's choice
  - GOTO Loop

### type="checkpoint", checkpoint="knowledge"
  - Show `suggestedKnowledge[]` to user
  - ASK user if they want to save, modify, or skip
  - If save: RUN `onComplete` with entries JSON
  - If skip: RUN `onSkip`
  - GOTO Loop

### type="list"
  - Show `tasks[]` to user with taskId, description, status, currentStep
  - ASK user which task to resume
  - RUN `npx spets orchestrate resume <selectedTaskId>`
  - GOTO Loop

### type="complete" or "error"
  - PRINT message
  - STOP

## Forbidden

Planning mode, task tracking tools

$ARGUMENTS
description: Task description for the workflow (or "resume" to continue a previous workflow)
