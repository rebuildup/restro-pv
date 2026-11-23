import React from "react";
import { Composition } from "remotion";
import { PvVideo, CompOnly } from "./PvVideo.tsx";

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
