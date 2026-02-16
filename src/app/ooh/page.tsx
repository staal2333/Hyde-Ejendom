import { redirect } from "next/navigation";

/**
 * /ooh now redirects to the main page with the OOH tab active.
 * OOH is fully integrated into the main dashboard.
 */
export default function OOHRedirect() {
  redirect("/#ooh");
}
