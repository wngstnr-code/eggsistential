import { Composition } from "remotion";
import { EggsistentialLogoReveal } from "./LogoReveal";

export const RemotionRoot = () => {
  return (
    <Composition
      id="EggsistentialLogoReveal"
      component={EggsistentialLogoReveal}
      durationInFrames={90}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
