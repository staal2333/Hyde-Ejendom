export function getPhaseIcon(phase: string): string {
  const map: Record<string, string> = {
    // ── Traffic ──
    traffic_check: "🚦", traffic_ok: "✅", traffic_rejected: "🚫", traffic_warning: "⚠️", traffic_skip: "⏭️",

    // ── Discovery / Scanning ──
    scan: "🔍", scan_done: "🏗️",
    scoring: "🧠", scoring_batch: "🧠", scoring_done: "✨",
    staging_created: "📌", dedup_skip: "⏭️", staging_error: "❌",

    // ── OIS ──
    ois: "🏛️", ois_start: "🏛️", ois_dawa: "🗺️", ois_bfe: "🔑", ois_bfe_found: "🔑",
    ois_bfe_fallback: "🔄", ois_matrikel: "📐", ois_kommune: "🏙️", ois_ejer: "👤",
    ois_owner: "👤", ois_admin: "🏢", ois_classification: "🏷️", ois_done: "✅",
    ois_fail: "❌", ois_error: "❌", ois_websearch: "🔍",
    ois_kommune_resolved: "🏙️", ois_contact_inject: "🏛️", ois_owner_set: "🏛️",
    ois_contact_added: "🏛️", ois_bfe_found_detail: "🔑",
    city_validated: "✅", city_unsupported: "⚠️", city_unsupported_confirmed: "⚠️",

    // ── CVR ──
    cvr: "🏢", cvr_strategy: "⚙️", cvr_skip: "⏭️", cvr_contact: "📞",
    cvr_owners: "👥", cvr_contact_inject: "🏢", cvr_contact_added: "🏢",

    // ── BBR ──
    bbr: "🏗️",

    // ── Proff.dk ──
    proff_leadership: "👔",

    // ── Web search ──
    search: "🔍", search_done: "📋", search_query: "🔍", search_result: "📄",
    search_backup: "🌐", search_backup_done: "🌐",

    // ── Scraping ──
    scrape: "🕷️", scrape_sites: "🕷️", scrape_result: "📧", scrape_done: "📋",
    scrape_site: "🌐",

    // ── LLM ──
    llm_start: "🧠", llm_done: "💡", llm_phase1_done: "💡",
    llm_contact_ranked: "🏆", llm_contact_chosen: "⭐",

    // ── Validation ──
    validation_start: "🛡️", validation_clean: "✅", validation_corrections: "⚠️",
    validate_llm: "🛡️",

    // ── Contacts ──
    contact_ranked: "🏆", contact_chosen: "⭐", contact_no_email: "📭",
    relevance_check: "🔎", contacts_done: "👥", contact_create: "👤",

    // ── Email hunt ──
    email_hunt_start: "🎯", email_hunt_person: "🕵️", email_hunt_step: "🔎",
    email_hunt_found: "🎉", email_hunt_fallback: "🔄", email_hunt_done: "📪",
    email_hunt_skip: "⏭️",

    // ── Email draft ──
    email_start: "✍️", email_done: "📧", email_skipped: "⏭️",
    email_generated: "📧",

    // ── HubSpot ──
    hubspot: "📦", hubspot_created: "📦", hubspot_skip: "⏭️", hubspot_error: "❌",
    hubspot_updated: "☁️",

    // ── Staging / Research ──
    staging_updated: "💾", draft_saved: "💾", status_updated: "🏷️",
    research_start: "🔎", research_step: "🔍", research_done: "📊",
    research_property: "🏠", research_property_done: "✅", research_property_failed: "❌",

    // ── Pipeline phases ──
    step: "▶️", start: "🚀", fetch_done: "📋",
    property_start: "🏠", property_done: "✅",
    quality_gate: "🚦", data_quality_warning: "⚠️",
    agent_done: "🏁", discovery_complete: "🏁",

    // ── Score batch (street agent) ──
    scoring_batch_error: "❌",

    // ── Safe mode ──
    safe_mode: "🔒", safe_mode_skip: "🔒",

    // ── General ──
    done: "✅", complete: "✅", error: "❌", stopped: "⏹️",
    cancelled: "⏹️",
  };
  return map[phase] || "▶️";
}

export function getPhaseColor(phase: string): string {
  // Errors
  if (["error", "hubspot_error", "traffic_rejected", "ois_fail", "ois_error",
       "staging_error", "research_property_failed", "scoring_batch_error"].includes(phase))
    return "text-red-400";

  // Success / done
  if (["done", "complete", "traffic_ok", "property_done", "validation_clean",
       "city_validated", "research_property_done", "agent_done", "discovery_complete",
       "ois_done", "staging_created"].includes(phase))
    return "text-green-400";

  // Email hunt success
  if (phase === "email_hunt_found" || phase === "email_generated") return "text-green-400";

  // HubSpot saves
  if (["hubspot_created", "draft_saved", "staging_updated"].includes(phase)) return "text-emerald-400";

  // Skips / dedup
  if (["hubspot_skip", "email_skipped", "email_hunt_skip", "stopped", "dedup_skip",
       "cvr_skip", "cancelled", "traffic_skip"].includes(phase))
    return "text-slate-500";

  // LLM / AI
  if (["scoring_done", "llm_done", "llm_phase1_done", "llm_contact_chosen",
       "contact_chosen"].includes(phase))
    return "text-amber-300";

  // Warnings
  if (["traffic_warning", "validation_corrections", "data_quality_warning",
       "city_unsupported", "safe_mode"].includes(phase))
    return "text-amber-400";

  // OIS (teal)
  if (phase.startsWith("ois") || phase === "city_validated" || phase === "city_unsupported_confirmed")
    return "text-teal-300";

  // CVR (blue)
  if (phase.startsWith("cvr")) return "text-blue-300";

  // BBR
  if (phase === "bbr") return "text-cyan-400";

  // Proff.dk
  if (phase.startsWith("proff")) return "text-indigo-300";

  // Email hunt (orange)
  if (phase.startsWith("email_hunt")) return "text-orange-300";

  // Email / contact (purple)
  if (phase.startsWith("email") || phase.startsWith("contact")) return "text-purple-300";

  // Research / search / scrape (cyan)
  if (phase.startsWith("research") || phase.startsWith("search") || phase.startsWith("scrape"))
    return "text-cyan-300";

  // LLM / scoring / validation (amber)
  if (phase.startsWith("llm") || phase.startsWith("scoring") || phase.startsWith("validation"))
    return "text-amber-200";

  // Staging
  if (phase.startsWith("staging")) return "text-emerald-300";

  // Agent
  if (phase.startsWith("agent")) return "text-violet-300";

  return "text-slate-300";
}
