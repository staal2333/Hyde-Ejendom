export function getPhaseIcon(phase: string): string {
  const map: Record<string, string> = {
    traffic_check: "\u{1F6A6}", traffic_ok: "\u2705", traffic_rejected: "\u{1F6AB}", traffic_warning: "\u26A0\uFE0F",
    scan: "\u{1F50D}", scan_done: "\u{1F3D7}\uFE0F",
    scoring: "\u{1F9E0}", scoring_batch: "\u{1F9E0}", scoring_done: "\u2728",
    hubspot: "\u{1F4E6}", hubspot_created: "\u{1F4E6}", hubspot_skip: "\u23ED\uFE0F", hubspot_error: "\u274C",
    search: "\u{1F50D}", search_done: "\u{1F50D}", search_backup: "\u{1F310}", search_backup_done: "\u{1F310}",
    done: "\u2705", complete: "\u2705", error: "\u274C",
    start: "\u{1F680}", fetch_done: "\u{1F4CB}",
    property_start: "\u{1F3E0}", property_done: "\u2705",
    step: "\u25B6\uFE0F", research_start: "\u{1F50E}", research_step: "\u{1F50D}", research_done: "\u{1F4CA}",
    llm_start: "\u{1F9E0}", llm_done: "\u{1F4A1}",
    hubspot_updated: "\u2601\uFE0F", contact_create: "\u{1F464}", contacts_done: "\u{1F465}",
    email_start: "\u270D\uFE0F", email_done: "\u{1F4E7}", email_skipped: "\u23ED\uFE0F",
    draft_saved: "\u{1F4BE}", status_updated: "\u{1F3F7}\uFE0F",
    cvr: "\u{1F3E2}", bbr: "\u{1F3D7}\uFE0F", scrape: "\u{1F578}\uFE0F",
    search_query: "\u{1F50D}", search_result: "\u{1F4C4}", scrape_site: "\u{1F310}", scrape_result: "\u{1F4E7}", scrape_done: "\u{1F4CB}",
    ois_contact_inject: "\u{1F3DB}\uFE0F", ois_owner_set: "\u{1F3DB}\uFE0F", ois_contact_added: "\u{1F3DB}\uFE0F",
    cvr_contact_inject: "\u{1F3E2}", cvr_contact_added: "\u{1F3E2}",
    email_hunt_start: "\u{1F3AF}", email_hunt_person: "\u{1F575}\uFE0F",
    email_hunt_step: "\u{1F50E}", email_hunt_found: "\u{1F389}",
    email_hunt_fallback: "\u{1F504}", email_hunt_done: "\u{1F4EC}",
    email_hunt_skip: "\u23ED\uFE0F",
    stopped: "\u23F9\uFE0F",
  };
  return map[phase] || "\u25B6\uFE0F";
}

export function getPhaseColor(phase: string): string {
  if (phase === "error" || phase === "hubspot_error" || phase === "traffic_rejected") return "text-red-400";
  if (phase === "done" || phase === "complete" || phase === "traffic_ok" || phase === "property_done") return "text-green-400";
  if (phase === "email_hunt_found") return "text-green-400";
  if (phase === "hubspot_created" || phase === "draft_saved") return "text-emerald-400";
  if (phase === "hubspot_skip" || phase === "email_skipped" || phase === "email_hunt_skip" || phase === "stopped") return "text-slate-500";
  if (phase === "scoring_done" || phase === "llm_done") return "text-amber-300";
  if (phase === "traffic_warning") return "text-amber-400";
  if (phase.includes("ois")) return "text-teal-300";
  if (phase.includes("email_hunt")) return "text-orange-300";
  if (phase.includes("research") || phase.includes("search") || phase.includes("scrape")) return "text-cyan-300";
  if (phase.includes("email") || phase.includes("contact")) return "text-purple-300";
  return "text-slate-300";
}
