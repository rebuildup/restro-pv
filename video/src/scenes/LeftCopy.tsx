import React from "react";

// Left-column copy, authored per SPEC §4. Replaces the dumped `description`
// and `Heading` comps, which showed multiple simultaneous text blocks and a
// heading that persisted for all 20s. One headline + one support line per
// scene, positioned in the measured left column (x≈32, lower zone y≈585).

interface Copy {
  head: string[];
  sub?: string;
}

const COPY: Array<{ from: number; to: number; copy: Copy }> = [
  {
    from: 0,
    to: 1.88,
    copy: { head: ["文字の輪郭から、", "筆画ごとのシェイプへ。"] },
  },
  {
    from: 1.88,
    to: 4.21,
    copy: { head: ["こんな文字分解、", "見たことがありますか？"] },
  },
  {
    from: 4.21,
    to: 7.96,
    copy: {
      head: ["つながった輪郭から、", "一画ずつの形を復元する"],
      sub: "交差して見えない部分まで、筆画の形を推定します",
    },
  },
  {
    from: 7.96,
    to: 11.71,
    copy: {
      head: ["分かれた筆画で、", "もっと自由な動き・表現"],
      sub: "一画ずつが独立したシェイプになるから、演出の幅が広がります",
    },
  },
  {
    from: 11.71,
    to: 15.46,
    copy: {
      head: ["After Effectsで、", "そのまま動かせる。"],
      sub: "分解・編集・キーフレームまで、いつもの画面で",
    },
  },
  {
    from: 15.46,
    to: 20,
    copy: { head: ["輪郭から筆画へ。", "筆画から表現へ。"] },
  },
];

export const LeftCopy: React.FC<{ t: number }> = ({ t }) => {
  const cur = COPY.find((c) => t >= c.from && t < c.to);
  if (!cur) return null;
  // soft crossfade at scene boundaries (6 frames)
  const FADE = 6 / 24;
  const since = t - cur.from;
  const opacity = since < FADE ? since / FADE : 1;
  const { head, sub } = cur.copy;
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        top: 600,
        width: 400,
        opacity,
        fontFamily: '"Noto Sans JP", sans-serif',
        color: "#1a1a1a",
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.35, letterSpacing: 0.02 }}>
        {head.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {sub && (
        <div style={{ marginTop: 18, fontSize: 24, lineHeight: 1.6, color: "#444" }}>
          {sub}
        </div>
      )}
    </div>
  );
};
