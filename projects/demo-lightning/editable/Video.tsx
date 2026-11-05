/**
 * Editable composition for project "demo-lightning".
 * Generated once by the video studio, then owned by you: open it in Remotion
 * Studio (npm run studio) and edit text, colours, positions, timing, captions
 * and media visually. Studio writes your changes back into this file.
 * Regenerating a single scene only patches that scene's named elements.
 */
import {staticFile, Track} from "remotion";
import {Audio} from "@remotion/media";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import {blurDissolve, dipToBlack, flash, zoomThrough} from "../../../src/video/animations/transitions";
import {
  AnimatedInfographicScene,
  ArtLayer,
  Backdrop,
  CaptionLayer,
  Chip,
  ComparisonScene,
  FactCardScene,
  FilmLook,
  ListicleScene,
  MediaLayer,
  MusicBed,
  NumberCounterScene,
  OutroScene,
  ProductShowcaseScene,
  QuoteScene,
  TextLayer,
  TimelineScene,
} from "../../../src/video/scenes";


export const Video_demo_lightning = () => {
  return (
    <>
      <TransitionSeries name="Scenes">
        <TransitionSeries.Sequence name="s01 · Hotter than the *Sun*" durationInFrames={156}>
          <ArtLayer name="s01 visual" art="storm-clouds" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="" seed={1} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s01 title" animation="word-stagger" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffe066" shadow={1} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 112, color: "#f4f7ff", translate: "0px -77px"}}>Hotter than the *Sun*</TextLayer>
          <CaptionLayer name="s01 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Lightning", startMs: 300, endMs: 1061, timestampMs: 681, confidence: null},
            {text: " is", startMs: 1061, endMs: 1230, timestampMs: 1146, confidence: null},
            {text: " about", startMs: 1230, endMs: 1653, timestampMs: 1442, confidence: null},
            {text: " five", startMs: 1653, endMs: 1991, timestampMs: 1822, confidence: null},
            {text: " times", startMs: 1991, endMs: 2414, timestampMs: 2203, confidence: null},
            {text: " hotter", startMs: 2414, endMs: 2921, timestampMs: 2668, confidence: null},
            {text: " than", startMs: 2921, endMs: 3260, timestampMs: 3091, confidence: null},
            {text: " the", startMs: 3260, endMs: 3513, timestampMs: 3387, confidence: null},
            {text: " surface", startMs: 3513, endMs: 4105, timestampMs: 3809, confidence: null},
            {text: " of", startMs: 4105, endMs: 4274, timestampMs: 4190, confidence: null},
            {text: " the", startMs: 4274, endMs: 4528, timestampMs: 4401, confidence: null},
            {text: " Sun.", startMs: 4528, endMs: 4858, timestampMs: 4693, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
        <TransitionSeries.Sequence name="s02 · Charge separates" durationInFrames={182}>
          <ArtLayer name="s02 visual" art="charge-separation" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="Positive charge rises | Negative charge sinks | Ground turns positive" seed={2} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s02 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffe066" shadow={1} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 70, color: "#f4f7ff", translate: "0px -691px"}}>Charge separates</TextLayer>
          <CaptionLayer name="s02 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Inside", startMs: 533, endMs: 935, timestampMs: 734, confidence: null},
            {text: " a", startMs: 935, endMs: 1069, timestampMs: 1002, confidence: null},
            {text: " storm", startMs: 1069, endMs: 1404, timestampMs: 1237, confidence: null},
            {text: " cloud,", startMs: 1404, endMs: 1752, timestampMs: 1578, confidence: null},
            {text: " ice", startMs: 1940, endMs: 2141, timestampMs: 2041, confidence: null},
            {text: " crystals", startMs: 2141, endMs: 2677, timestampMs: 2409, confidence: null},
            {text: " and", startMs: 2677, endMs: 2878, timestampMs: 2778, confidence: null},
            {text: " soft", startMs: 2878, endMs: 3146, timestampMs: 3012, confidence: null},
            {text: " hail", startMs: 3146, endMs: 3414, timestampMs: 3280, confidence: null},
            {text: " collide,", startMs: 3414, endMs: 3864, timestampMs: 3639, confidence: null},
            {text: " separating", startMs: 4084, endMs: 4754, timestampMs: 4419, confidence: null},
            {text: " electric", startMs: 4754, endMs: 5290, timestampMs: 5022, confidence: null},
            {text: " charge.", startMs: 5290, endMs: 5682, timestampMs: 5486, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-left"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s03 · The leader descends" durationInFrames={169}>
          <ArtLayer name="s03 visual" art="stepped-leader" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="Stepped leader | Upward streamer | Connection" seed={3} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s03 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffe066" shadow={1} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 70, color: "#f4f7ff", translate: "0px -691px"}}>The leader descends</TextLayer>
          <CaptionLayer name="s03 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "When", startMs: 600, endMs: 881, timestampMs: 741, confidence: null},
            {text: " the", startMs: 881, endMs: 1093, timestampMs: 987, confidence: null},
            {text: " imbalance", startMs: 1093, endMs: 1726, timestampMs: 1410, confidence: null},
            {text: " grows,", startMs: 1726, endMs: 2092, timestampMs: 1909, confidence: null},
            {text: " a", startMs: 2289, endMs: 2430, timestampMs: 2360, confidence: null},
            {text: " faint", startMs: 2430, endMs: 2781, timestampMs: 2606, confidence: null},
            {text: " stepped", startMs: 2781, endMs: 3274, timestampMs: 3028, confidence: null},
            {text: " leader", startMs: 3274, endMs: 3696, timestampMs: 3485, confidence: null},
            {text: " zigzags", startMs: 3696, endMs: 4189, timestampMs: 3943, confidence: null},
            {text: " toward", startMs: 4189, endMs: 4611, timestampMs: 4400, confidence: null},
            {text: " the", startMs: 4611, endMs: 4822, timestampMs: 4717, confidence: null},
            {text: " ground.", startMs: 4822, endMs: 5235, timestampMs: 5029, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={flash()} timing={linearTiming({durationInFrames: 8})} />
        <TransitionSeries.Sequence name="s04 · The return stroke" durationInFrames={197}>
          <MediaLayer name="s04 visual" src={staticFile("demo-lightning/assets/s04-still-v1.png")} mediaType="image" motion="push-in" motionStrength={0.08} darken={0.35} blur={0} style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s04 title" animation="blur-in" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffe066" shadow={1} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 88, color: "#f4f7ff", translate: "0px -461px"}}>The return stroke</TextLayer>
          <CaptionLayer name="s04 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "It", startMs: 400, endMs: 572, timestampMs: 486, confidence: null},
            {text: " meets", startMs: 572, endMs: 1001, timestampMs: 787, confidence: null},
            {text: " a", startMs: 1001, endMs: 1173, timestampMs: 1087, confidence: null},
            {text: " streamer", startMs: 1173, endMs: 1859, timestampMs: 1516, confidence: null},
            {text: " rising", startMs: 1859, endMs: 2374, timestampMs: 2117, confidence: null},
            {text: " up,", startMs: 2374, endMs: 2653, timestampMs: 2514, confidence: null},
            {text: " and", startMs: 2804, endMs: 3061, timestampMs: 2933, confidence: null},
            {text: " a", startMs: 3061, endMs: 3233, timestampMs: 3147, confidence: null},
            {text: " huge", startMs: 3233, endMs: 3576, timestampMs: 3405, confidence: null},
            {text: " current", startMs: 3576, endMs: 4177, timestampMs: 3877, confidence: null},
            {text: " flashes", startMs: 4177, endMs: 4778, timestampMs: 4478, confidence: null},
            {text: " back", startMs: 4778, endMs: 5122, timestampMs: 4950, confidence: null},
            {text: " up", startMs: 5122, endMs: 5293, timestampMs: 5208, confidence: null},
            {text: " the", startMs: 5293, endMs: 5551, timestampMs: 5422, confidence: null},
            {text: " channel.", startMs: 5551, endMs: 6189, timestampMs: 5870, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={zoomThrough()} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s05 · Peak temperature" durationInFrames={130}>
          <Backdrop name="s05 backdrop" colorA="#070b18" colorB="#141c3a" angle={160} style={{}} />
          <ArtLayer name="s05 visual" art="thunder-wave" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="" seed={5} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1, opacity: 0.3}} />
          <NumberCounterScene name="s05 layout" value={30000} prefix="" suffix=" K" label="Air temperature inside the channel" decimals={0} accentColor="#ffe066" textColor="#f4f7ff" panelColor="rgba(8,10,22,0.66)" displayFont="'Space Grotesk', sans-serif" bodyFont="'Space Grotesk', sans-serif" animation="fade-up" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s05 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "That", startMs: 600, endMs: 911, timestampMs: 756, confidence: null},
            {text: " heats", startMs: 911, endMs: 1301, timestampMs: 1106, confidence: null},
            {text: " the", startMs: 1301, endMs: 1534, timestampMs: 1418, confidence: null},
            {text: " air", startMs: 1534, endMs: 1768, timestampMs: 1651, confidence: null},
            {text: " to", startMs: 1768, endMs: 1924, timestampMs: 1846, confidence: null},
            {text: " around", startMs: 1924, endMs: 2391, timestampMs: 2158, confidence: null},
            {text: " thirty", startMs: 2391, endMs: 2858, timestampMs: 2625, confidence: null},
            {text: " thousand", startMs: 2858, endMs: 3481, timestampMs: 3170, confidence: null},
            {text: " kelvin.", startMs: 3481, endMs: 3962, timestampMs: 3722, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
        <TransitionSeries.Sequence name="s06 · Then comes thunder" durationInFrames={132}>
          <ArtLayer name="s06 visual" art="thunder-wave" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="Superheated air | Shock wave becomes thunder" seed={6} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s06 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffe066" shadow={1} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 70, color: "#f4f7ff", translate: "0px -691px"}}>Then comes thunder</TextLayer>
          <CaptionLayer name="s06 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "The", startMs: 533, endMs: 760, timestampMs: 647, confidence: null},
            {text: " air", startMs: 760, endMs: 986, timestampMs: 873, confidence: null},
            {text: " explodes", startMs: 986, endMs: 1591, timestampMs: 1289, confidence: null},
            {text: " outward.", startMs: 1591, endMs: 2126, timestampMs: 1859, confidence: null},
            {text: " That", startMs: 2346, endMs: 2648, timestampMs: 2497, confidence: null},
            {text: " shock", startMs: 2648, endMs: 3026, timestampMs: 2837, confidence: null},
            {text: " wave", startMs: 3026, endMs: 3328, timestampMs: 3177, confidence: null},
            {text: " is", startMs: 3328, endMs: 3479, timestampMs: 3404, confidence: null},
            {text: " thunder.", startMs: 3479, endMs: 4015, timestampMs: 3747, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-bottom"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s07 · Try it next storm" durationInFrames={194}>
          <Backdrop name="s07 backdrop" colorA="#070b18" colorB="#141c3a" angle={160} style={{}} />
          <ArtLayer name="s07 visual" art="storm-clouds" primaryColor="#8ab4ff" accentColor="#ffe066" backgroundColor="#070b18" labels="" seed={7} labelFont="'Space Grotesk', sans-serif" titleSafe style={{translate: "0px 0px", scale: 1, opacity: 0.3}} />
          <OutroScene name="s07 layout" cta="Flash to thunder: 3 seconds ≈ 1 km" handle="" accentColor="#ffe066" textColor="#f4f7ff" panelColor="rgba(8,10,22,0.66)" displayFont="'Space Grotesk', sans-serif" bodyFont="'Space Grotesk', sans-serif" animation="fade-up" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s07 captions" captionStyle="word-highlight" wordsPerGroup={4} highlightColor="#ffe066" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 70, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Count", startMs: 600, endMs: 973, timestampMs: 787, confidence: null},
            {text: " from", startMs: 973, endMs: 1272, timestampMs: 1123, confidence: null},
            {text: " flash", startMs: 1272, endMs: 1646, timestampMs: 1459, confidence: null},
            {text: " to", startMs: 1646, endMs: 1795, timestampMs: 1721, confidence: null},
            {text: " thunder:", startMs: 1795, endMs: 2322, timestampMs: 2059, confidence: null},
            {text: " every", startMs: 2542, endMs: 2916, timestampMs: 2729, confidence: null},
            {text: " three", startMs: 2916, endMs: 3289, timestampMs: 3103, confidence: null},
            {text: " seconds", startMs: 3289, endMs: 3812, timestampMs: 3551, confidence: null},
            {text: " is", startMs: 3812, endMs: 3961, timestampMs: 3887, confidence: null},
            {text: " about", startMs: 3961, endMs: 4335, timestampMs: 4148, confidence: null},
            {text: " one", startMs: 4335, endMs: 4559, timestampMs: 4447, confidence: null},
            {text: " kilometre.", startMs: 4559, endMs: 5235, timestampMs: 4897, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <FilmLook name="Film look" vignette={0.5} grain={0.05} tint="#8ab4ff" tintAmount={0} />
      <Track name="Music">
        <MusicBed name="Music" src={staticFile("demo-lightning/audio/background-music.mp3")} volume={0.18} duckTo={0.072} fadeInSeconds={1} fadeOutSeconds={2} muted={false} duckRanges={[]} />
      </Track>
      <Track name="Sound effects">
        <Audio name="s01 sfx thunder" src={staticFile("demo-lightning/audio/sfx-s01-thunder.mp3")} from={0} volume={0.45} />
        <Audio name="s06 sfx thunder" src={staticFile("demo-lightning/audio/sfx-s06-thunder.mp3")} from={774} volume={0.45} />
      </Track>
    </>
  );
};
