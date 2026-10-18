"use client";

import { useRef, useState } from "react";

/** A hidden PDF file input: `open()` shows the file picker, `file` is the chosen PDF. */
export function usePdfPicker() {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const input = (
    <input
      ref={ref}
      type="file"
      accept="application/pdf,.pdf"
      tabIndex={-1}
      aria-hidden="true"
      className="hidden"
      onChange={(e) => {
        const chosen = e.target.files?.[0];
        e.target.value = "";
        if (chosen) setFile(chosen);
      }}
    />
  );

  return { input, file, open: () => ref.current?.click(), clear: () => setFile(null) };
}
