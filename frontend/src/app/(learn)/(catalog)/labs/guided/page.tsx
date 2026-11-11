import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { loadGuidedTracks } from "@/lib/guided-labs-server";
import { AreaHero, AreaPage, AreaSection, ComingSoonPanel, StepList } from "@/components/areas/area-page";
import { GuidedTrackList } from "@/components/areas/guided-track-list";

export const metadata: Metadata = {
  title: "Guided labs",
  description: "Real projects built one small step at a time. Each lab has tests, a quiz follows it, and a capstone in your own GitHub repository is checked automatically.",
  alternates: { canonical: "/labs/guided" },
  openGraph: { title: "Guided labs on Edorax", url: "/labs/guided", images: [SITE_SHARE_IMAGE] },
};

export default async function GuidedLabsPage() {
  const tracks = await loadGuidedTracks();

  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Guided labs"
        status="live"
        mood="think"
        intro="One real project, split into small steps. You build it on your own computer, tests tell you whether each step worked, a quiz follows every lab, and the project ends in your own GitHub repository where our checker reads it."
      />

      <AreaSection id="tracks" title="The Dev Weekends tracks" intro="Three take-home tracks, one per level. Each is a course you enroll in, and its labs are the guided labs.">
        <GuidedTrackList tracks={tracks} />
      </AreaSection>

      <AreaSection id="how" title="How a guided lab works">
        <StepList
          steps={[
            { title: "Read one step", body: "A short goal and why it matters, then what to do. One thing changes at a time, so you can see what caused what." },
            { title: "Build it yourself", body: "Write the code on your own computer, or in a GitHub Codespace in your browser. There is no answer to copy." },
            { title: "Tests check the result", body: "Each lab ships with tests that run on your code and say what passes and what is still missing." },
            { title: "A quiz after every lab", body: "A few questions check that you understood what you just built, not only that it runs." },
            { title: "The capstone is checked automatically", body: "Push your project to your own GitHub repository. Our AI checker reads it against a list of criteria you can see, and tells you what to fix. You get a few checks a day." },
            { title: "A certificate to share", body: "When the capstone passes, you get a certificate for the level that you can add to your LinkedIn profile." },
          ]}
        />
      </AreaSection>

      <ComingSoonPanel title="Shell labs are still to come" action={{ href: "/labs/shell", label: "See shell labs" }}>
        Labs where the terminal and the machine are ours, with checks that look at the machine itself, arrive with the Edorax desktop app. Guided labs run on your own computer today.
      </ComingSoonPanel>
    </AreaPage>
  );
}
