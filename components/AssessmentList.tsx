"use client";

import { AlertTriangle, Plus } from "lucide-react";
import {
  type Assessment,
  effectiveBestOf,
  formatGrade,
  formatWeight,
  groupAssessments,
  parentGrade,
  partsWeightCheck,
} from "@/lib/grades";
import { AssessmentEditor, type EditorActions } from "./AssessmentEditor";

/** One row per assessment, parts indented under their parent. Tapping a row opens its editor. */
export function AssessmentList({
  idPrefix,
  assessments,
  editingId,
  onEdit,
  actions,
}: {
  idPrefix: string;
  assessments: Assessment[];
  editingId: string | null;
  onEdit: (id: string | null) => void;
  actions: EditorActions;
}) {
  const groups = groupAssessments(assessments);
  const rowId = (id: string) => `${idPrefix}-row-${id}`;

  const close = (id: string) => {
    onEdit(null);
    requestAnimationFrame(() => document.getElementById(rowId(id))?.focus());
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
      <div
        aria-hidden="true"
        className="flex gap-3 border-b border-line bg-sunken px-4 py-2 text-xs font-medium text-ink-2"
      >
        <span className="flex-1">Assessment</span>
        <span className="w-14 text-right">Weight</span>
        <span className="w-24 text-right">Grade</span>
      </div>
      <ul className="divide-y divide-line">
        {groups.map(({ assessment: a, parts }) => {
          const bestOf = effectiveBestOf(a, parts);
          const partsCheck = partsWeightCheck(a, parts);
          return (
            <li key={a.id}>
              <Row
                id={rowId(a.id)}
                assessment={a}
                parts={parts}
                open={editingId === a.id}
                onToggle={() => (editingId === a.id ? close(a.id) : onEdit(a.id))}
              />
              {editingId === a.id && (
                <AssessmentEditor
                  assessment={a}
                  parts={parts}
                  canSplit={parts.length === 0}
                  actions={actions}
                  onClose={() => close(a.id)}
                />
              )}
              {parts.length > 0 && (
                <ul className="mb-2 ml-5 border-l-2 border-line">
                  {parts.map((p) => (
                    <li key={p.id}>
                      <Row
                        id={rowId(p.id)}
                        assessment={p}
                        parts={[]}
                        hideWeight={bestOf !== null}
                        open={editingId === p.id}
                        onToggle={() => (editingId === p.id ? close(p.id) : onEdit(p.id))}
                      />
                      {editingId === p.id && (
                        <AssessmentEditor
                          assessment={p}
                          parts={[]}
                          canSplit={false}
                          actions={actions}
                          onClose={() => close(p.id)}
                        />
                      )}
                    </li>
                  ))}
                  {bestOf === null && !partsCheck.ok && (
                    <li className="px-3 py-2 text-sm text-warn">
                      <AlertTriangle aria-hidden="true" size={14} className="mr-1 inline -translate-y-px" />
                      Parts add up to {formatWeight(partsCheck.total)}%, but {a.name} is{" "}
                      {formatWeight(a.weight)}%.
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({
  id,
  assessment: a,
  parts,
  hideWeight = false,
  open,
  onToggle,
}: {
  id: string;
  assessment: Assessment;
  parts: Assessment[];
  hideWeight?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const isParent = parts.length > 0;
  const bestOf = effectiveBestOf(a, parts);
  const calculated = isParent ? parentGrade(a, parts) : null;

  const notes: string[] = [];
  if (a.min_grade !== null) notes.push(`min ${formatGrade(a.min_grade)}`);
  if (bestOf !== null) notes.push(`best ${bestOf} of ${parts.length} count`);

  let gradeText: React.ReactNode;
  if (calculated) {
    gradeText =
      calculated.grade === null ? (
        <span className="text-ink-3">–</span>
      ) : (
        <span className="font-semibold text-ink">
          {formatGrade(calculated.grade)}
          {!calculated.complete && <span className="block text-xs font-normal text-ink-3">so far</span>}
        </span>
      );
  } else if (a.grade === null) {
    gradeText = (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
        <Plus aria-hidden="true" size={14} strokeWidth={2.5} />
        Add grade
      </span>
    );
  } else {
    gradeText = <span className="font-semibold text-ink">{formatGrade(a.grade)}</span>;
  }

  return (
    <button
      type="button"
      id={id}
      aria-expanded={open}
      onClick={onToggle}
      className={`flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[var(--dur-fast)] hover:bg-sunken ${
        open ? "bg-sunken" : ""
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="wrap-anywhere block font-medium text-ink">{a.name}</span>
        {notes.length > 0 && (
          <span className="block text-xs text-ink-3">{notes.join(" · ")}</span>
        )}
      </span>
      <span className="w-14 shrink-0 text-right text-sm text-ink-2 num">
        {!hideWeight && (
          <>
            <span className="sr-only">weight </span>
            {formatWeight(a.weight)}%
          </>
        )}
      </span>
      <span className="num w-24 shrink-0 text-right">
        <span className="sr-only">{isParent ? "calculated grade " : "grade "}</span>
        {gradeText}
      </span>
      <span className="sr-only">{open ? ", close editor" : ", edit"}</span>
    </button>
  );
}
