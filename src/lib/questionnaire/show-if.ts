import type { QuestionType } from '@/components/questionnaire/question-types';

export type ShowIfRule = {
  questionId: string;
  operator: 'equals';
  value: string;
};

// Minimal answer snapshot type — avoids circular dependency with answer-coercion.
// Callers (DynamicApplicationForm, submitDynamicApplication) map their full
// AnswerValue union onto this narrower shape before calling evaluateShowIf.
type AnswerSnapshot = Record<string, { kind: string; value: unknown } | undefined>;

export function evaluateShowIf(
  rule: ShowIfRule | null | undefined,
  answers: AnswerSnapshot,
): boolean {
  if (rule == null) return true;
  const ans = answers[rule.questionId];
  if (ans == null) return false;
  switch (ans.kind) {
    case 'boolean': // yes_no — rule.value is "true" or "false"
      return String(ans.value) === rule.value;
    case 'choice': // single_select — rule.value is an option key
      return ans.value === rule.value;
    default:
      // Unsupported trigger type: treat question as hidden (defensive; DB
      // constraint prevents saving such rules, but guard the runtime path too).
      return false;
  }
}

export type ShowIfValidationError = {
  questionId: string;
  message: string;
};

type QuestionForValidation = {
  id: string;
  position: number;
  type: QuestionType;
  options?: { key: string }[] | null;
  show_if?: ShowIfRule | null;
};

export function validateShowIfRules(questions: QuestionForValidation[]): {
  ok: boolean;
  errors: ShowIfValidationError[];
} {
  const errors: ShowIfValidationError[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const q of questions) {
    const rule = q.show_if;
    if (rule == null) continue;

    const trigger = byId.get(rule.questionId);

    // Forward-reference: trigger must exist and have a smaller position.
    if (trigger == null || trigger.position >= q.position) {
      errors.push({
        questionId: q.id,
        message: `Show-if on "${q.id}" references a question that does not exist or comes after it (forward reference not allowed).`,
      });
      continue;
    }

    // Trigger type must be yes_no or single_select.
    if (trigger.type !== 'yes_no' && trigger.type !== 'single_select') {
      errors.push({
        questionId: q.id,
        message: `Show-if on "${q.id}" references question "${trigger.id}" of type "${trigger.type}"; only yes_no and single_select are supported as triggers.`,
      });
      continue;
    }

    // yes_no: rule value must be "true" or "false".
    if (trigger.type === 'yes_no') {
      if (rule.value !== 'true' && rule.value !== 'false') {
        errors.push({
          questionId: q.id,
          message: `Show-if on "${q.id}" has value "${rule.value}" for a yes_no trigger; must be "true" or "false".`,
        });
      }
    }

    // single_select: rule value must match a current option key.
    if (trigger.type === 'single_select') {
      const optionKeys = (trigger.options ?? []).map((o) => o.key);
      if (!optionKeys.includes(rule.value)) {
        errors.push({
          questionId: q.id,
          message: `Show-if on "${q.id}" references option key "${rule.value}" which does not exist on question "${trigger.id}".`,
        });
      }
    }
  }

  // Cycle detection via DFS over the show-if graph.
  // A cycle exists if following show-if edges from any node reaches itself.
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Map(questions.map((q) => [q.id, WHITE]));

  function dfs(id: string): boolean {
    if (color.get(id) === GREY) return true; // back-edge → cycle
    if (color.get(id) === BLACK) return false;
    color.set(id, GREY);
    const q = byId.get(id);
    if (q?.show_if) {
      if (dfs(q.show_if.questionId)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const q of questions) {
    if (color.get(q.id) === WHITE && dfs(q.id)) {
      errors.push({
        questionId: q.id,
        message: `Show-if rules form a cycle involving question "${q.id}".`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
