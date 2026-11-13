import { redirect } from "next/navigation";

// "Your profile" now lives inside the app shell at /profile. /me just forwards there; the learn
// layout enforces authentication.
export default function MePage() {
  redirect("/profile");
}
