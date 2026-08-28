"use client";

import { Check, Copy, Upload } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import type { QuestionBank } from "@/lib/types";

import { importQuestions } from "./actions";

/**
 * Import questions from JSON — docs/FRONTEND.md §8, the third "Add question" path.
 *
 * The point of this screen is to turn a block of JSON (a teacher's own, or an
 * LLM's) into questions without typing each choice by hand. It pairs with the
 * feedback drafting: import questions and answers here, then let the per-choice
 * Suggest buttons or the bulk panel write the explanations.
 *
 * Two rules are the teacher-facing product:
 *
 *  - **Invalid JSON is caught here**, before any request, with a plain-language
 *    message — a raw `SyntaxError` is no help to someone who left a trailing comma.
 *  - **The import is all-or-nothing**, enforced server-side. A single bad question
 *    fails the whole paste with its position named, rather than importing half a
 *    quiz that the builder would then report as finished.
 */

const NEW_BANK = "__new__";

// Two question shapes the import accepts. `type` defaults to "mc" (multiple
// choice); "tf" is a true/false question, which the backend requires to have
// exactly two choices (quizzes/imports.py). Both are shown so a teacher can see
// that true/false questions exist without reading the docs.
const MC_QUESTION = `  {
    "text": "What is the capital of France?",
    "type": "mc",
    "choices": [
      { "text": "Paris", "correct": true },
      { "text": "Lyon", "correct": false, "feedback": "Lyon is a city, but not the capital." },
      { "text": "Marseille", "correct": false }
    ]
  }`;

const TF_QUESTION = `  {
    "text": "The Pacific is the largest ocean on Earth.",
    "type": "tf",
    "choices": [
      { "text": "True", "correct": true },
      { "text": "False", "correct": false, "feedback": "The Pacific is in fact the largest ocean — bigger than all land combined." }
    ]
  }`;

// Each format is a complete, importable array on its own — the copy buttons put
// exactly this on the clipboard, ready to paste straight back into the box.
const MC_EXAMPLE = `[\n${MC_QUESTION}\n]`;
const TF_EXAMPLE = `[\n${TF_QUESTION}\n]`;
// The in-box example holds one of each so the "Paste an example" fill and the
// placeholder both make it clear true/false is an option.
const EXAMPLE = `[\n${MC_QUESTION},\n${TF_QUESTION}\n]`;

/**
 * A small inline button that copies a JSON format onto the clipboard, matching
 * the "Paste an example" text-button style. It flips to a check for ~1.5s so the
 * click has visible feedback; if the clipboard is unavailable (an insecure
 * context, or the user denied it) it stays silent — the in-box example gives the
 * same JSON another way.
 */
function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — no-op, deliberately.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label} format to clipboard`}
      // A filled chip, the secondary Button's look at a smaller scale, so it reads
      // as a button at rest rather than only lighting up on hover.
      className="pressable inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ImportPanel({
  quizId,
  banks,
  defaultBankId,
  onDone,
}: {
  quizId: number;
  banks: QuestionBank[];
  defaultBankId: number;
  onDone: () => void;
}) {
  const [json, setJson] = useState("");
  const [bankChoice, setBankChoice] = useState(String(defaultBankId));
  const [newBankName, setNewBankName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  function submit() {
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("That isn't valid JSON — check for a missing comma, quote, or bracket.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setError("The top level must be a non-empty array of questions: [ { … }, { … } ].");
      return;
    }

    const bank =
      bankChoice === NEW_BANK
        ? { newName: newBankName.trim() }
        : { id: Number(bankChoice) };
    if ("newName" in bank && !bank.newName) {
      setError("Name the new bank, or pick an existing one.");
      return;
    }

    startImport(async () => {
      const result = await importQuestions(quizId, parsed, bank);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Success closes the panel; the imported rows appearing in the list below is
      // the confirmation, and revalidation has already put them there.
      onDone();
    });
  }

  return (
    <Card className="w-full">
      <CardBody className="space-y-5 p-6">
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-medium">Import questions from JSON</h3>
            <p className="text-sm text-muted-foreground">
              Paste an array of questions. Each needs <code>text</code>, a{" "}
              <code>choices</code> array, and exactly one choice marked{" "}
              <code>&quot;correct&quot;: true</code>. Per-choice <code>feedback</code>{" "}
              is optional — leave it out and draft it with AI afterwards. Add{" "}
              <code>&quot;type&quot;: &quot;tf&quot;</code> for a true/false question
              (exactly two choices); <code>type</code> defaults to multiple choice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">
              Copy a format:
            </span>
            <CopyButton label="Multiple choice" text={MC_EXAMPLE} />
            <CopyButton label="True / false" text={TF_EXAMPLE} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="import-json">JSON</Label>
            <button
              type="button"
              onClick={() => setJson(EXAMPLE)}
              className="pressable rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Paste an example
            </button>
          </div>
          <Textarea
            id="import-json"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={EXAMPLE}
            aria-label="Questions as JSON"
            className="font-mono text-xs"
          />
        </div>

        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="import-bank">File the questions in</Label>
          <select
            id="import-bank"
            value={bankChoice}
            onChange={(event) => setBankChoice(event.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
            <option value={NEW_BANK}>Create new bank…</option>
          </select>
        </div>

        {bankChoice === NEW_BANK && (
          <Field
            htmlFor="import-new-bank"
            label="New bank name"
            hint="Created together with the questions, in this quiz's topic."
          >
            <Input
              id="import-new-bank"
              value={newBankName}
              onChange={(event) => setNewBankName(event.target.value)}
              placeholder="e.g. Imported — capitals"
              autoFocus
            />
          </Field>
        )}

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button onClick={submit} disabled={importing}>
            <Upload size={16} />
            {importing ? "Importing…" : "Import questions"}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
