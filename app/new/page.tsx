import { AspectRatio, CaptionStyleName, QualityPreset, VisualMode, VisualStylePreference } from "../../src/schemas/options";
import { createOptions } from "../../src/web/server";
import { CreateForm } from "./CreateForm";

export const dynamic = "force-dynamic";

export default function NewVideoPage() {
  const opts = createOptions();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>New video</h1>
          <p>Describe the video. The studio writes a creative direction, script and storyboard, sources visuals and narration, and renders an editable Remotion project.</p>
        </div>
      </div>
      <CreateForm
        options={{
          aspectRatios: AspectRatio.options,
          styles: VisualStylePreference.options,
          qualities: QualityPreset.options,
          visualModes: VisualMode.options,
          captionStyles: CaptionStyleName.options,
        }}
        {...opts}
      />
    </main>
  );
}
