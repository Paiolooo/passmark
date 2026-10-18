// Browser only: reads the text items of a PDF with pdf.js. The file never leaves the device.
import type { TextItem } from "./syllabus";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Plain-language problem with the chosen file, or null if it can be read. */
export function checkPdfFile(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "That file isn't a PDF. Choose the syllabus PDF.";
  if (file.size > MAX_PDF_BYTES) return "That PDF is larger than 10 MB. Choose a smaller file.";
  return null;
}

export async function readPdfTextItems(file: File): Promise<TextItem[]> {
  // Loaded only when a PDF is chosen, so pdf.js never slows down the rest of the app.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const items: TextItem[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const s = it.str.trim();
        if (!s) continue;
        items.push({ s, page, x: it.transform[4], y: it.transform[5], w: it.width });
      }
    }
  } finally {
    await doc.destroy();
  }
  return items;
}
