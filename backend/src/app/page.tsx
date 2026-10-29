import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The root is the operations dashboard. */
export default function Home() {
  redirect("/admin");
}