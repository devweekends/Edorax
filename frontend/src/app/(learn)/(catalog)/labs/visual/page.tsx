import { redirect } from "next/navigation";

// Visual labs are a filter on /labs now. Old links (and group anchors such as #networking) land on it.
export default function VisualLabsPage() {
  redirect("/labs#visual");
}
