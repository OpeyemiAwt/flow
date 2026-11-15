import React from "react";
import { Composition, registerRoot } from "remotion";
import { FlowExplainerComposition } from "./FlowExplainerComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FlowMasterExplainer"
        component={FlowExplainerComposition}
        durationInFrames={270 * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ cut: "master" as const }}
      />
      <Composition
        id="FlowPitch90"
        component={FlowExplainerComposition}
        durationInFrames={90 * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ cut: "pitch90" as const }}
      />
      <Composition
        id="FlowPromo30"
        component={FlowExplainerComposition}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ cut: "promo30" as const }}
      />
      <Composition
        id="FlowTeaser15"
        component={FlowExplainerComposition}
        durationInFrames={15 * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ cut: "teaser15" as const }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
