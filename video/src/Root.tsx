import React from "react";
import { Composition } from "remotion";
import { PvVideo, CompOnly } from "./PvVideo.tsx";
import { ProtoHookA, ProtoHookB } from "./scenes/ProtoHook.tsx";
import { PvFull } from "./film/PvFull.tsx";

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
      <Composition
        id="Proto-Hook-A"
        component={ProtoHookA}
        durationInFrames={96}
        fps={24}
        width={1080}
        height={1080}
      />
      <Composition
        id="Proto-Hook-B"
        component={ProtoHookB}
        durationInFrames={96}
        fps={24}
        width={1080}
        height={1080}
      />
      <Composition
        id="PV-Full"
        component={PvFull}
        durationInFrames={480}
        fps={24}
        width={1080}
        height={1080}
      />
    </>
  );
};
