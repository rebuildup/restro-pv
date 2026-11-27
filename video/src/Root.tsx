import React from "react";
import { Composition } from "remotion";
import { PvVideo, CompOnly, ChromeOnly } from "./PvVideo.tsx";

// Official compositions (Issue #30):
//   PV-Master — the production entry. Renders the confirmed common
//     layout (video/src/layout/Chrome.tsx) plus right-stage scenes via
//     the explicit slot (video/src/layout/Stage.tsx). This is the only
//     full-film composition and the only render target for delivery.
//   PV-Chrome — debug: chrome layer only, for layout-contract diffing.
//   PV-Comp / PV-Comp-Description — debug: single dumped comp viewers.
// The rejected pv-full series (video/src/rejected/pv-full/) is NOT
// registered here and must not become a production entry point.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PV-Master"
        component={PvVideo}
        durationInFrames={480}
        fps={24}
        width={1080}
        height={1080}
      />
      <Composition
        id="PV-Chrome"
        component={ChromeOnly}
        durationInFrames={480}
        fps={24}
        width={1080}
        height={1080}
      />
      <Composition
        id="PV-Comp"
        component={CompOnly}
        durationInFrames={480}
        fps={24}
        width={1080}
        height={1080}
        defaultProps={{ compName: "bunkai" }}
      />
      <Composition
        id="PV-Comp-Description"
        component={CompOnly}
        durationInFrames={240}
        fps={24}
        width={1080}
        height={1080}
        defaultProps={{ compName: "description" }}
      />
    </>
  );
};
