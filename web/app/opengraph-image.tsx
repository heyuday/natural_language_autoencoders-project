import { ImageResponse } from "next/og";

export const alt = "Steering vectors from written descriptions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: "#f9f9f7", padding: "72px 80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, color: "#64635e", letterSpacing: 2, textTransform: "uppercase" }}>Activation steering · October 2026</div>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#0b0b0b", marginTop: 24, lineHeight: 1.1 }}>Steering vectors from written descriptions</div>
          <div style={{ fontSize: 34, color: "#3f3e3b", marginTop: 28, lineHeight: 1.35, maxWidth: 1000 }}>
            Hand-written descriptions, compiled into steering vectors for Qwen2.5-7B by a Natural Language Autoencoder.
            Controls, negative results, and every number traced to code.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, color: "#3f3e3b" }}>
          <div>Uday Tyagi and Tyler Kim</div>
          <div style={{ display: "flex", gap: 14 }}>
            {["#2a78d6", "#eb6834", "#1baf7a", "#898781"].map((c) => (
              <div key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
