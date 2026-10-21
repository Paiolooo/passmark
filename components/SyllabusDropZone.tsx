"use client";

import { FileUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * The main way to add courses: drop (or choose) one or more syllabus PDFs, a whole semester at
 * once. The PDFs are read on this device; nothing is uploaded.
 */
export function SyllabusDropZone({
  onFiles,
  compact = false,
  buttonRef,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  /** The "choose files" button, for other places that start an import. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length > 0) onFiles(files);
  };

  // Files chosen before the page finished loading (slow phones) would be lost: take them now.
  useEffect(() => {
    if (input.current?.files?.length) {
      take(input.current.files);
      input.current.value = "";
    }
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        id={`${id}-files`}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        data-testid="syllabus-files"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => input.current?.click()}
        aria-describedby={`${id}-hint`}
        className={`group flex w-full items-center gap-4 rounded-[var(--radius-lg)] border-2 border-dashed text-left transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          compact ? "p-4" : "p-5 sm:p-7"
        } ${over ? "border-brand bg-brand-tint" : "border-line-strong bg-surface hover:border-brand hover:bg-brand-tint/50"}`}
      >
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full bg-brand text-on-brand ${compact ? "h-10 w-10" : "h-12 w-12 sm:h-14 sm:w-14"}`}
        >
          <FileUp size={compact ? 20 : 24} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className={`block font-semibold text-ink ${compact ? "text-base" : "text-lg sm:text-xl"}`}>
            {over ? "Drop your syllabus PDFs here" : "Import your syllabus PDFs"}
          </span>
          <span id={`${id}-hint`} className="mt-0.5 block text-sm text-ink-2">
            Click or drag and drop. Several at once is fine: a whole semester. Read on your device, never uploaded.
          </span>
        </span>
      </button>
    </div>
  );
}
