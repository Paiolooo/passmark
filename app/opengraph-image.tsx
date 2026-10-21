import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The link preview (Open Graph, and Twitter falls back to it): the wordmark, the promise and the
// two example cards from the landing page. Design tokens (light theme) written out as hex here,
// because the image is drawn outside the page's CSS.
export const alt = "PassMark: know the grade you need to pass, and your GPA, live.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#FAF8F4";
const SURFACE = "#FFFFFF";
const INK = "#16201C";
const INK_2 = "#47524D";
const LINE = "#E5DFD3";
const BRAND = "#0F5C4A";
const BRAND_INK = "#0D5242";
const BRAND_TINT = "#E6EFEA";

function Mark({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 28 28">
      <rect width="28" height="28" rx="8" fill={BRAND} />
      <path d="M7 18a7 7 0 0 1 14 0" fill="none" stroke="#FFFFFF" strokeOpacity=".35" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 18a7 7 0 0 1 11.2-5.6" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const card = {
  display: "flex",
  flexDirection: "column" as const,
  background: SURFACE,
  border: `2px solid ${LINE}`,
  borderRadius: 28,
  padding: "28px 32px",
  boxShadow: "0 24px 48px -20px rgba(22,32,28,0.35)",
};

export default async function Image() {
  // Geist, regular and semibold (OFL, see assets/fonts/README.md).
  const [regular, semibold] = await Promise.all(
    ["Geist-Regular.ttf", "Geist-SemiBold.ttf"].map((f) => readFile(join(process.cwd(), "assets/fonts", f))),
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, padding: 64, gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Mark size={56} />
            <span style={{ fontSize: 40, fontWeight: 600, color: INK, letterSpacing: -1 }}>PassMark</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, fontWeight: 600, color: BRAND_INK }}>
              Grade &amp; GPA calculator for IE University students
            </span>
            <span style={{ marginTop: 16, fontSize: 64, lineHeight: 1.05, fontWeight: 600, color: INK, letterSpacing: -2 }}>
              Know the grade you need to pass — and your GPA, live.
            </span>
          </div>
          <span style={{ fontSize: 26, color: INK_2 }}>Free · Private · 30-second setup</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 400, gap: 24 }}>
          <div style={card}>
            <span style={{ fontSize: 26, fontWeight: 600, color: INK }}>Corporate Finance</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 12 }}>
              <span style={{ fontSize: 88, fontWeight: 600, lineHeight: 0.9, color: BRAND_INK, letterSpacing: -4 }}>6.8</span>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 22, color: INK_2, lineHeight: 1.2, paddingBottom: 6 }}>
                <span>needed on the</span>
                <span>Final exam</span>
              </div>
            </div>
          </div>
          <div style={{ ...card, marginLeft: 72 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, color: INK_2 }}>Semester GPA</span>
              <span
                style={{ fontSize: 18, fontWeight: 600, color: BRAND_INK, background: BRAND_TINT, borderRadius: 999, padding: "4px 12px" }}
              >
                ● live
              </span>
            </div>
            <span style={{ fontSize: 80, fontWeight: 600, lineHeight: 1, color: INK, letterSpacing: -3, marginTop: 8 }}>8.4</span>
            <span style={{ fontSize: 22, color: INK_2, marginTop: 8 }}>Overall 8.9</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [
        { name: "Geist", data: regular, style: "normal", weight: 400 },
        { name: "Geist", data: semibold, style: "normal", weight: 600 },
      ] },
  );
}
