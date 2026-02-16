"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ConfirmModal from "./ConfirmModal";
import Ic from "./ui/Icon";
import TabBar from "./ui/TabBar";
import StatusBadge from "./ui/StatusBadge";

// ── Types ────────────────────────────────────────────────

interface OOHContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company: string;
  industry?: string;
  city?: string;
  notes?: string;
  tags: string[];
  lastContactedAt?: string;
  totalProposalsSent: number;
  createdAt: string;
  updatedAt: string;
}

interface OOHCampaign {
  id: string;
  name: string;
  status: string;
  networkId?: string;
  frameIds: string[];
  creativeId?: string;
  templateId?: string;
  contactIds: string[];
  emailSubject: string;
  emailBody: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

interface OOHSend {
  id: string;
  campaignId: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactCompany?: string;
  proposalPdfUrl?: string;
  status: string;
  sentAt?: string;
  openedAt?: string;
  repliedAt?: string;
  followUpCount: number;
  nextFollowUpAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface Frame {
  id: string;
  name: string;
  locationCity?: string;
  frameImageUrl: string;
}

interface Creative {
  id: string;
  filename: string;
  companyName: string;
  thumbnailUrl?: string;
}

interface Network {
  id: string;
  name: string;
  frameIds: string[];
}

interface PresentationTemplate {
  id: string;
  name: string;
  pageCount: number;
}

// ── Props ────────────────────────────────────────────────

export interface OOHOutreachProps {
  frames: Frame[];
  creatives: Creative[];
  networks: Network[];
  presTemplates: PresentationTemplate[];
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

// ── Sub-tabs ─────────────────────────────────────────────
type OutreachSubTab = "contacts" | "campaigns" | "pipeline" | "sends" | "followups";

// ── Main Component ───────────────────────────────────────

export default function OOHOutreach({ frames, creatives, networks, presTemplates, onToast }: OOHOutreachProps) {
  const [subTab, setSubTab] = useState<OutreachSubTab>("campaigns");

  // Data
  const [contacts, setContacts] = useState<OOHContact[]>([]);
  const [campaigns, setCampaigns] = useState<OOHCampaign[]>([]);
  const [sends, setSends] = useState<OOHSend[]>([]);
  const [dueFollowUps, setDueFollowUps] = useState<OOHSend[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingContact, setEditingContact] = useState<OOHContact | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<OOHCampaign | null>(null);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);

  // HubSpot state
  const [hubspotContacts, setHubspotContacts] = useState<{ hubspotId: string; name: string; email: string; phone: string; company: string; jobTitle: string; city: string; leadStatus: string; lifecycleStage: string }[]>([]);
  const [hubspotProperties, setHubspotProperties] = useState<{ hubspotId: string; name: string; address: string; city: string; zip: string; outreachStatus: string; outdoorScore?: number; ownerCompany: string; contactPerson: string; contactEmail: string; contactPhone: string; emailDraftSubject: string; emailDraftBody: string }[]>([]);
  const [hubspotLoading, setHubspotLoading] = useState(false);
  const [hubspotLoaded, setHubspotLoaded] = useState(false);
  const [hubspotError, setHubspotError] = useState<string | null>(null);
  const [selectedHubspotIds, setSelectedHubspotIds] = useState<Set<string>>(new Set());
  const [importingHubspot, setImportingHubspot] = useState(false);
  const [showHubspotPanel, setShowHubspotPanel] = useState(false);
  const [hubspotSearch, setHubspotSearch] = useState("");

  const [aiMatching, setAiMatching] = useState(false);
  const [aiDraftingEmail, setAiDraftingEmail] = useState(false);
  const [aiFollowUpDrafts, setAiFollowUpDrafts] = useState<{ sendId: string; contactName: string; contactEmail: string; followUpNumber: number; subject: string; body: string }[]>([]);
  const [generatingFollowUpDrafts, setGeneratingFollowUpDrafts] = useState(false);
  const [aiMatchContext, setAiMatchContext] = useState("");

  // Contact form state
  const [cfName, setCfName] = useState("");
  const [cfEmail, setCfEmail] = useState("");
  const [cfPhone, setCfPhone] = useState("");
  const [cfCompany, setCfCompany] = useState("");
  const [cfIndustry, setCfIndustry] = useState("");
  const [cfCity, setCfCity] = useState("");
  const [cfNotes, setCfNotes] = useState("");
  const [cfTags, setCfTags] = useState("");

  // Campaign form state
  const [campName, setCampName] = useState("");
  const [campFrameIds, setCampFrameIds] = useState<string[]>([]);
  const [campNetworkId, setCampNetworkId] = useState("");
  const [campCreativeId, setCampCreativeId] = useState("");
  const [campTemplateId, setCampTemplateId] = useState("");
  const [campContactIds, setCampContactIds] = useState<string[]>([]);
  const [campSubject, setCampSubject] = useState("");
  const [campBody, setCampBody] = useState("");

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; total: number } | null>(null);

  // Campaign search/filter
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string>("");

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    detail?: string;
    variant?: "danger" | "warning" | "info";
    confirmLabel?: string;
    loading?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const showConfirm = useCallback((opts: Omit<typeof confirmModal, "open">) => {
    setConfirmModal({ ...opts, open: true });
  }, []);
  const closeConfirm = useCallback(() => setConfirmModal(prev => ({ ...prev, open: false })), []);

  // Campaign form validation errors
  const campErrors = useMemo(() => {
    const e: string[] = [];
    if (showCampaignForm) {
      if (!campName.trim()) e.push("name");
      if (campContactIds.length === 0) e.push("contacts");
      if (!campSubject.trim()) e.push("subject");
      if (!campBody.trim()) e.push("body");
    }
    return e;
  }, [showCampaignForm, campName, campContactIds, campSubject, campBody]);

  // Send preview state
  const [sendPreviewCampaign, setSendPreviewCampaign] = useState<OOHCampaign | null>(null);

  // ── Data fetching ──────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, campaignsRes, sendsRes] = await Promise.all([
        fetch("/api/ooh/contacts"),
        fetch("/api/ooh/campaigns"),
        fetch("/api/ooh/sends"),
      ]);
      
      if (!contactsRes.ok) {
        console.error("Error fetching contacts:", contactsRes.status, contactsRes.statusText);
      }
      if (!campaignsRes.ok) {
        console.error("Error fetching campaigns:", campaignsRes.status, campaignsRes.statusText);
      }
      if (!sendsRes.ok) {
        console.error("Error fetching sends:", sendsRes.status, sendsRes.statusText);
      }
      
      const [contactsData, campaignsData, sendsData] = await Promise.all([
        contactsRes.ok ? contactsRes.json() : { contacts: [] },
        campaignsRes.ok ? campaignsRes.json() : { campaigns: [] },
        sendsRes.ok ? sendsRes.json() : { sends: [] },
      ]);
      setContacts(contactsData.contacts || []);
      setCampaigns(campaignsData.campaigns || []);
      setSends(sendsData.sends || []);

      // Fetch due follow-ups
      const followUpRes = await fetch("/api/ooh/sends?status=sent");
      if (!followUpRes.ok) {
        console.error("Error fetching follow-ups:", followUpRes.status, followUpRes.statusText);
      }
      const followUpData = followUpRes.ok ? await followUpRes.json() : { sends: [] };
      const now = new Date();
      const due = (followUpData.sends || []).filter((s: OOHSend) =>
        s.nextFollowUpAt && new Date(s.nextFollowUpAt) <= now
      );
      setDueFollowUps(due);

      return contactsData.contacts?.length || 0;
    } catch (err) {
      console.error("Error fetching outreach data:", err);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── HubSpot Auto-Sync ─────────────────────────────────

  const syncHubspot = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/ooh/hubspot-sync", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSyncResult({ created: result.created, updated: result.updated, total: result.totalOohContacts });
      if (!silent && (result.created > 0 || result.updated > 0)) {
        onToast(`HubSpot sync: ${result.created} nye, ${result.updated} opdateret (${result.totalOohContacts} total)`, "success");
      }
      // Refresh contacts after sync
      await fetchAll();
    } catch (err) {
      if (!silent) {
        onToast(err instanceof Error ? err.message : "HubSpot sync fejlede", "error");
      }
      console.error("[hubspot-sync]", err);
    } finally {
      setSyncing(false);
    }
  }, [fetchAll, onToast]);

  // Initial load: fetch data, then auto-sync HubSpot if no contacts
  useEffect(() => {
    (async () => {
      const count = await fetchAll();
      // Auto-sync HubSpot on first load if there are few/no contacts
      if (count === 0) {
        syncHubspot(true);
      }
    })();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Contact helpers ────────────────────────────────────

  const resetContactForm = () => {
    setCfName(""); setCfEmail(""); setCfPhone(""); setCfCompany("");
    setCfIndustry(""); setCfCity(""); setCfNotes(""); setCfTags("");
    setEditingContact(null); setShowContactForm(false);
  };

  const saveContact = async () => {
    if (!cfName.trim() || !cfEmail.trim()) {
      onToast("Navn og email er påkrævet", "error");
      return;
    }

    const tags = cfTags.split(",").map(t => t.trim()).filter(Boolean);

    setSavingContact(true);
    try {
      if (editingContact) {
        const res = await fetch("/api/ooh/contacts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingContact.id,
            name: cfName,
            email: cfEmail,
            phone: cfPhone || undefined,
            company: cfCompany,
            industry: cfIndustry || undefined,
            city: cfCity || undefined,
            notes: cfNotes || undefined,
            tags,
          }),
        });
        const updated = await res.json();
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        onToast("Kontakt opdateret", "success");
      } else {
        const res = await fetch("/api/ooh/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cfName,
            email: cfEmail,
            phone: cfPhone || undefined,
            company: cfCompany,
            industry: cfIndustry || undefined,
            city: cfCity || undefined,
            notes: cfNotes || undefined,
            tags,
          }),
        });
        const created = await res.json();
        setContacts(prev => [created, ...prev]);
        onToast("Kontakt oprettet", "success");
      }
      resetContactForm();
    } catch {
      onToast("Kunne ikke gemme kontakt", "error");
    } finally {
      setSavingContact(false);
    }
  };

  const deleteContact = (id: string) => {
    const contact = contacts.find(c => c.id === id);
    showConfirm({
      title: "Slet kontakt",
      message: "Er du sikker på du vil slette denne kontakt?",
      detail: contact ? `${contact.name} – ${contact.email}` : undefined,
      variant: "danger",
      confirmLabel: "Slet",
      onConfirm: async () => {
        closeConfirm();
        try {
          await fetch(`/api/ooh/contacts?id=${id}`, { method: "DELETE" });
          setContacts(prev => prev.filter(c => c.id !== id));
          onToast("Kontakt slettet", "success");
        } catch {
          onToast("Kunne ikke slette kontakt", "error");
        }
      },
    });
  };

  const editContact = (c: OOHContact) => {
    setEditingContact(c);
    setCfName(c.name); setCfEmail(c.email); setCfPhone(c.phone || "");
    setCfCompany(c.company); setCfIndustry(c.industry || "");
    setCfCity(c.city || ""); setCfNotes(c.notes || "");
    setCfTags(c.tags.join(", "));
    setShowContactForm(true);
  };

  // ── Campaign helpers ───────────────────────────────────

  const resetCampaignForm = () => {
    setCampName(""); setCampFrameIds([]); setCampNetworkId("");
    setCampCreativeId(""); setCampTemplateId(""); setCampContactIds([]);
    setCampSubject(""); setCampBody("");
    setEditingCampaign(null); setShowCampaignForm(false);
  };

  const saveCampaign = async () => {
    if (!campName.trim()) {
      onToast("Kampagnenavn er påkrævet", "error");
      return;
    }

    setSavingCampaign(true);
    try {
      if (editingCampaign) {
        const res = await fetch("/api/ooh/campaigns", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingCampaign.id,
            name: campName,
            networkId: campNetworkId || undefined,
            frameIds: campFrameIds,
            creativeId: campCreativeId || undefined,
            templateId: campTemplateId || undefined,
            contactIds: campContactIds,
            emailSubject: campSubject,
            emailBody: campBody,
          }),
        });
        const updated = await res.json();
        setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
        onToast("Kampagne opdateret", "success");
      } else {
        const res = await fetch("/api/ooh/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campName,
            networkId: campNetworkId || undefined,
            frameIds: campFrameIds,
            creativeId: campCreativeId || undefined,
            templateId: campTemplateId || undefined,
            contactIds: campContactIds,
            emailSubject: campSubject,
            emailBody: campBody,
          }),
        });
        const created = await res.json();
        setCampaigns(prev => [created, ...prev]);
        onToast("Kampagne oprettet", "success");
      }
      resetCampaignForm();
    } catch {
      onToast("Kunne ikke gemme kampagne", "error");
    } finally {
      setSavingCampaign(false);
    }
  };

  const deleteCampaign = (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    showConfirm({
      title: "Slet kampagne",
      message: "Er du sikker på du vil slette denne kampagne?",
      detail: campaign ? `${campaign.name} (${campaign.contactIds.length} kontakter)` : undefined,
      variant: "danger",
      confirmLabel: "Slet",
      onConfirm: async () => {
        closeConfirm();
        try {
          await fetch(`/api/ooh/campaigns?id=${id}`, { method: "DELETE" });
          setCampaigns(prev => prev.filter(c => c.id !== id));
          onToast("Kampagne slettet", "success");
        } catch {
          onToast("Kunne ikke slette kampagne", "error");
        }
      },
    });
  };

  const editCampaign = (c: OOHCampaign) => {
    setEditingCampaign(c);
    setCampName(c.name); setCampFrameIds(c.frameIds);
    setCampNetworkId(c.networkId || ""); setCampCreativeId(c.creativeId || "");
    setCampTemplateId(c.templateId || ""); setCampContactIds(c.contactIds);
    setCampSubject(c.emailSubject); setCampBody(c.emailBody);
    setShowCampaignForm(true);
  };

  const sendCampaign = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    // Show send preview modal
    setSendPreviewCampaign(campaign);
  };

  const confirmSendCampaign = async () => {
    if (!sendPreviewCampaign) return;
    const campaignId = sendPreviewCampaign.id;
    setSendPreviewCampaign(null);
    setSendingCampaignId(campaignId);
    try {
      const res = await fetch("/api/ooh/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onToast(`Kampagne sendt! ${result.sent}/${result.totalContacts} emails afsendt`, "success");
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Fejl ved afsendelse", "error");
    } finally {
      setSendingCampaignId(null);
    }
  };

  // ── HubSpot Integration ────────────────────────────────

  const fetchHubspot = async () => {
    setHubspotLoading(true);
    setHubspotError(null);
    try {
      const res = await fetch(`/api/ooh/hubspot-contacts?search=${encodeURIComponent(hubspotSearch)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente HubSpot data");
      setHubspotContacts(data.contacts || []);
      setHubspotProperties(data.properties || []);
      setHubspotLoaded(true);
    } catch (err) {
      setHubspotError(err instanceof Error ? err.message : "HubSpot fejl");
    } finally {
      setHubspotLoading(false);
    }
  };

  const importSelectedHubspot = async () => {
    if (selectedHubspotIds.size === 0) return;
    setImportingHubspot(true);
    try {
      const res = await fetch("/api/ooh/hubspot-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selectedHubspotIds) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onToast(`${result.imported} kontakter importeret fra HubSpot!`, "success");
      setSelectedHubspotIds(new Set());
      setShowHubspotPanel(false);
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Import fejlede", "error");
    } finally {
      setImportingHubspot(false);
    }
  };

  const toggleHubspotSelect = (id: string) => {
    setSelectedHubspotIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Check which HubSpot contacts are already imported
  const isAlreadyImported = (hsEmail: string) =>
    contacts.some(c => c.email.toLowerCase() === hsEmail.toLowerCase());

  // ── AI: Client Matcher ─────────────────────────────────

  const runAiMatch = async () => {
    setAiMatching(true);
    try {
      const res = await fetch("/api/ooh/agent/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: aiMatchContext || undefined }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onToast(`AI oprettede ${result.createdCampaigns} kampagneforslag!`, "success");
      setAiMatchContext("");
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "AI matching fejlede", "error");
    } finally {
      setAiMatching(false);
    }
  };

  // ── AI: Email Draft ───────────────────────────────────

  const generateAiDraft = async (campaignId: string) => {
    const camp = campaigns.find(c => c.id === campaignId);
    if (!camp || !camp.contactIds.length) return;

    setAiDraftingEmail(true);
    try {
      // Generate email for first contact as template
      const res = await fetch("/api/ooh/agent/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: camp.contactIds[0],
          frameIds: camp.frameIds,
          networkId: camp.networkId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Update the campaign with the AI-generated email
      await fetch("/api/ooh/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaignId,
          emailSubject: result.subject,
          emailBody: result.body,
        }),
      });

      onToast("AI har genereret email-udkast!", "success");
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "AI email draft fejlede", "error");
    } finally {
      setAiDraftingEmail(false);
    }
  };

  // ── AI: Follow-up Drafts ──────────────────────────────

  const generateFollowUpDrafts = async () => {
    setGeneratingFollowUpDrafts(true);
    try {
      const res = await fetch("/api/ooh/agent/follow-up", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setAiFollowUpDrafts(result.drafts || []);
      if (result.drafts.length === 0) {
        onToast("Ingen forfaldne opfølgninger", "info");
      } else {
        onToast(`AI har genereret ${result.drafts.length} opfølgningsudkast`, "success");
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : "AI follow-up fejlede", "error");
    } finally {
      setGeneratingFollowUpDrafts(false);
    }
  };

  const sendAiFollowUp = async (draft: typeof aiFollowUpDrafts[0]) => {
    setSendingFollowUp(draft.sendId);
    try {
      const res = await fetch("/api/ooh/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sendId: draft.sendId,
          emailSubject: draft.subject,
          emailBody: draft.body,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onToast(`Opfølgning sendt til ${draft.contactName}!`, "success");
      setAiFollowUpDrafts(prev => prev.filter(d => d.sendId !== draft.sendId));
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Sending fejlede", "error");
    } finally {
      setSendingFollowUp(null);
    }
  };

  // ── Send follow-up ─────────────────────────────────────

  const sendFollowUp = (sendId: string) => {
    const send = sends.find(s => s.id === sendId) || dueFollowUps.find(s => s.id === sendId);
    showConfirm({
      title: "Send opfølgning",
      message: `Send opfølgningsmail til ${send?.contactName || "kontakten"}?`,
      detail: send?.contactEmail || undefined,
      variant: "info",
      confirmLabel: "Send opfølgning",
      onConfirm: () => {
        closeConfirm();
        doSendFollowUp(sendId);
      },
    });
  };

  const doSendFollowUp = async (sendId: string) => {
    setSendingFollowUp(sendId);
    try {
      const res = await fetch("/api/ooh/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onToast(`Opfølgning #${result.followUpCount} sendt!`, "success");
      fetchAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Fejl ved opfølgning", "error");
    } finally {
      setSendingFollowUp(null);
    }
  };

  // ── Manual status update ───────────────────────────────

  const updateSendStatus = async (sendId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/ooh/sends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sendId, status: newStatus }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Unknown error" }));
        onToast(error.error || "Kunne ikke opdatere status", "error");
        return;
      }
      const updated = await res.json();
      setSends(prev => prev.map(s => s.id === updated.id ? updated : s));
      onToast("Status opdateret", "success");
    } catch {
      onToast("Kunne ikke opdatere status", "error");
    }
  };

  // ── Filter helpers ─────────────────────────────────────
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (!contactSearch) return true;
      const q = contactSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
    });
  }, [contacts, contactSearch]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (campaignStatusFilter && c.status !== campaignStatusFilter) return false;
      if (!campaignSearch) return true;
      const q = campaignSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.emailSubject.toLowerCase().includes(q);
    });
  }, [campaigns, campaignSearch, campaignStatusFilter]);

  // ── Populate network frames ────────────────────────────
  const selectNetwork = (netId: string) => {
    setCampNetworkId(netId);
    const net = networks.find(n => n.id === netId);
    if (net) setCampFrameIds(net.frameIds);
  };

  // Toggle contact in campaign
  const toggleCampContact = (id: string) => {
    setCampContactIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Sub-tab navigation ────────────────────────────────
  // Pipeline columns configuration
  const PIPELINE_COLUMNS: { status: string; label: string; color: string; bgColor: string }[] = [
    { status: "sent", label: "Sendt", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200" },
    { status: "opened", label: "Åbnet", color: "text-indigo-700", bgColor: "bg-indigo-50 border-indigo-200" },
    { status: "replied", label: "Svaret", color: "text-violet-700", bgColor: "bg-violet-50 border-violet-200" },
    { status: "meeting", label: "Møde", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200" },
    { status: "sold", label: "Solgt", color: "text-green-700", bgColor: "bg-green-50 border-green-200" },
    { status: "rejected", label: "Afvist", color: "text-red-700", bgColor: "bg-red-50 border-red-200" },
  ];

  // Drag-and-drop state for pipeline
  const [dragSendId, setDragSendId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Pipeline stats
  const pipelineStats = useMemo(() => {
    const total = sends.filter(s => s.status !== "queued" && s.status !== "error").length;
    const opened = sends.filter(s => ["opened", "replied", "meeting", "sold"].includes(s.status)).length;
    const replied = sends.filter(s => ["replied", "meeting", "sold"].includes(s.status)).length;
    const sold = sends.filter(s => s.status === "sold").length;
    return {
      total,
      openRate: total > 0 ? Math.round((opened / total) * 100) : 0,
      replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
      closeRate: total > 0 ? Math.round((sold / total) * 100) : 0,
    };
  }, [sends]);

  const SUB_TABS: { id: OutreachSubTab; label: string; count?: number; icon: string }[] = [
    { id: "campaigns", label: "Kampagner", count: campaigns.length, icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
    { id: "pipeline", label: "Pipeline", count: sends.filter(s => s.status !== "queued" && s.status !== "error").length, icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" },
    { id: "contacts", label: "Kontakter", count: contacts.length, icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
    { id: "sends", label: "Historik", count: sends.length, icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" },
    { id: "followups", label: "Opfølgninger", count: dueFollowUps.length, icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-3 border-violet-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tab navigation */}
      <TabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} size="small" />

      {/* ═══ PIPELINE ═══ */}
      {subTab === "pipeline" && (
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">Outreach Pipeline</h2>
            <p className="text-sm text-slate-500 mt-0.5">Visuelt overblik over alle kunder i outreach-flowet</p>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Totalt sendt", value: pipelineStats.total, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Åbningsrate", value: `${pipelineStats.openRate}%`, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Svarrate", value: `${pipelineStats.replyRate}%`, color: "text-violet-600", bg: "bg-violet-50" },
              { label: "Lukningsrate", value: `${pipelineStats.closeRate}%`, color: "text-green-600", bg: "bg-green-50" },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg} rounded-xl px-4 py-3 border border-slate-200/60`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color} mt-0.5`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Kanban board */}
          {sends.filter(s => s.status !== "queued" && s.status !== "error").length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Ic d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Ingen afsendelser i pipeline</p>
              <p className="text-xs text-slate-400 mt-1">Send en kampagne for at se kunder her</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 400px)" }}>
              {PIPELINE_COLUMNS.map(col => {
                const colSends = sends.filter(s => s.status === col.status);
                const isDragOver = dragOverCol === col.status;
                return (
                  <div
                    key={col.status}
                    className={`flex-shrink-0 w-56 flex flex-col rounded-xl border transition-all ${isDragOver ? "border-violet-400 bg-violet-50/30 ring-2 ring-violet-200" : col.bgColor}`}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.status); }}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={async e => {
                      e.preventDefault();
                      setDragOverCol(null);
                      if (dragSendId) {
                        const send = sends.find(s => s.id === dragSendId);
                        if (send && send.status !== col.status) {
                          await updateSendStatus(dragSendId, col.status);
                        }
                        setDragSendId(null);
                      }
                    }}
                  >
                    {/* Column header */}
                    <div className="px-3 py-2.5 border-b border-slate-200/60 flex items-center justify-between">
                      <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${col.color} bg-white/60`}>{colSends.length}</span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                      {colSends.map(s => {
                        const daysSince = s.sentAt
                          ? Math.floor((Date.now() - new Date(s.sentAt).getTime()) / (1000 * 60 * 60 * 24))
                          : 0;
                        return (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(e) => {
                              setDragSendId(s.id);
                              // Create a custom drag ghost
                              const ghost = document.createElement("div");
                              ghost.className = "bg-white rounded-lg border-2 border-violet-400 shadow-xl px-3 py-2 text-xs font-bold text-slate-900";
                              ghost.textContent = s.contactName || "Flyt";
                              ghost.style.position = "absolute";
                              ghost.style.top = "-999px";
                              document.body.appendChild(ghost);
                              e.dataTransfer.setDragImage(ghost, 60, 20);
                              setTimeout(() => document.body.removeChild(ghost), 0);
                            }}
                            onDragEnd={() => { setDragSendId(null); setDragOverCol(null); }}
                            className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all ${dragSendId === s.id ? "opacity-40 scale-95 border-violet-400 shadow-inner" : "border-slate-200/80 hover:shadow-md hover:border-slate-300"}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{s.contactName || "Ukendt"}</p>
                                <p className="text-[10px] text-slate-400 truncate">{s.contactCompany}</p>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5 truncate">{s.contactEmail}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[9px] text-slate-400">{daysSince}d siden</span>
                              {s.followUpCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 font-bold rounded">#{s.followUpCount} opf.</span>
                              )}
                            </div>

                            {/* Quick actions */}
                            <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100">
                              {col.status === "sent" && (
                                <button
                                  onClick={() => sendFollowUp(s.id)}
                                  disabled={sendingFollowUp === s.id}
                                  className="flex-1 px-2 py-1 text-[9px] font-semibold bg-amber-50 text-amber-700 rounded hover:bg-amber-100 text-center"
                                >
                                  Opfølgning
                                </button>
                              )}
                              {(col.status === "sent" || col.status === "opened") && (
                                <button
                                  onClick={() => updateSendStatus(s.id, "replied")}
                                  className="flex-1 px-2 py-1 text-[9px] font-semibold bg-violet-50 text-violet-700 rounded hover:bg-violet-100 text-center"
                                >
                                  Svaret
                                </button>
                              )}
                              {col.status === "replied" && (
                                <button
                                  onClick={() => updateSendStatus(s.id, "meeting")}
                                  className="flex-1 px-2 py-1 text-[9px] font-semibold bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 text-center"
                                >
                                  Møde
                                </button>
                              )}
                              {col.status === "meeting" && (
                                <button
                                  onClick={() => updateSendStatus(s.id, "sold")}
                                  className="flex-1 px-2 py-1 text-[9px] font-semibold bg-green-50 text-green-700 rounded hover:bg-green-100 text-center"
                                >
                                  Solgt
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {colSends.length === 0 && (
                        <div className="py-8 text-center">
                          <p className="text-[10px] text-slate-300">Ingen her</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ CONTACTS ═══ */}
      {subTab === "contacts" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Kontakter</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {contacts.length} kontakter
                {contacts.filter(c => c.tags.includes("hubspot")).length > 0 && (
                  <span className="text-orange-500 ml-1">· {contacts.filter(c => c.tags.includes("hubspot")).length} fra HubSpot</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => syncHubspot(false)} disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-semibold rounded-xl shadow-sm">
                {syncing ? (
                  <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />Synkroniserer...</>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984v-.066A2.2 2.2 0 0017.232.835h-.066a2.2 2.2 0 00-2.199 2.199v.066c0 .9.543 1.67 1.319 2.012V7.93a5.197 5.197 0 00-2.448 1.18L7.755 4.36a2.677 2.677 0 00.075-.58 2.67 2.67 0 10-2.67 2.67 2.65 2.65 0 001.45-.438l5.949 4.68a5.207 5.207 0 00-.59 2.42 5.234 5.234 0 00.703 2.622l-1.762 1.762a2.34 2.34 0 00-.706-.118 2.362 2.362 0 102.362 2.362 2.34 2.34 0 00-.118-.706l1.727-1.727a5.22 5.22 0 007.142-1.06 5.217 5.217 0 00-1.153-7.117z"/></svg>
                    Sync HubSpot
                  </>
                )}
              </button>
              <button onClick={() => { resetContactForm(); setShowContactForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl shadow-sm">
                <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Ny kontakt
              </button>
            </div>
          </div>

          {/* Sync result banner */}
          {syncResult && syncResult.created > 0 && (
            <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200/60 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984v-.066A2.2 2.2 0 0017.232.835h-.066a2.2 2.2 0 00-2.199 2.199v.066c0 .9.543 1.67 1.319 2.012V7.93a5.197 5.197 0 00-2.448 1.18L7.755 4.36a2.677 2.677 0 00.075-.58 2.67 2.67 0 10-2.67 2.67 2.65 2.65 0 001.45-.438l5.949 4.68a5.207 5.207 0 00-.59 2.42 5.234 5.234 0 00.703 2.622l-1.762 1.762a2.34 2.34 0 00-.706-.118 2.362 2.362 0 102.362 2.362 2.34 2.34 0 00-.118-.706l1.727-1.727a5.22 5.22 0 007.142-1.06 5.217 5.217 0 00-1.153-7.117z"/></svg>
              <span className="text-xs text-orange-800">
                HubSpot synkroniseret: <b>{syncResult.created} nye</b> kontakter importeret, <b>{syncResult.updated} opdateret</b> · {syncResult.total} kontakter total
              </span>
              <button onClick={() => setSyncResult(null)} className="ml-auto p-0.5 hover:bg-orange-100 rounded">
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3 text-orange-400" />
              </button>
            </div>
          )}

          {/* Auto-syncing indicator */}
          {syncing && contacts.length === 0 && (
            <div className="mb-4 flex items-center justify-center py-6 gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-200 border-t-orange-600" />
              <span className="text-xs text-orange-600 font-medium">Synkroniserer kontakter fra HubSpot...</span>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
              placeholder="Søg kontakter..." className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
          </div>

          {/* Contact list */}
          {filteredContacts.length === 0 && !syncing ? (
            <div className="text-center py-12 text-slate-400">
              <Ic d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Ingen kontakter endnu</p>
              <p className="text-xs text-slate-400 mt-1 mb-3">Tryk "Sync HubSpot" for at hente alle kunder, eller opret manuelt</p>
              <button onClick={() => syncHubspot(false)} disabled={syncing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-semibold rounded-xl shadow-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984v-.066A2.2 2.2 0 0017.232.835h-.066a2.2 2.2 0 00-2.199 2.199v.066c0 .9.543 1.67 1.319 2.012V7.93a5.197 5.197 0 00-2.448 1.18L7.755 4.36a2.677 2.677 0 00.075-.58 2.67 2.67 0 10-2.67 2.67 2.65 2.65 0 001.45-.438l5.949 4.68a5.207 5.207 0 00-.59 2.42 5.234 5.234 0 00.703 2.622l-1.762 1.762a2.34 2.34 0 00-.706-.118 2.362 2.362 0 102.362 2.362 2.34 2.34 0 00-.118-.706l1.727-1.727a5.22 5.22 0 007.142-1.06 5.217 5.217 0 00-1.153-7.117z"/></svg>
                Hent alle kunder fra HubSpot
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-200/80 hover:shadow-sm transition-all group">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                      {c.company && <span className="text-[10px] text-slate-400">· {c.company}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px] text-slate-500">{c.email}</span>
                      {c.city && <span className="text-[10px] text-slate-400">{c.city}</span>}
                      {c.totalProposalsSent > 0 && <span className="text-[10px] text-violet-500 font-medium">{c.totalProposalsSent} oplæg sendt</span>}
                    </div>
                    {c.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {c.tags.map((tag, i) => (
                          <span key={i} className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
                            tag === "hubspot" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
                          }`}>{tag === "hubspot" ? "HubSpot" : tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => editContact(c)} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Rediger">
                      <Ic d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button onClick={() => deleteContact(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Slet">
                      <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact Form Modal */}
          {showContactForm && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => resetContactForm()}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{editingContact ? "Rediger kontakt" : "Ny kontakt"}</h3>
                  <button onClick={resetContactForm} className="p-1 hover:bg-slate-100 rounded-lg">
                    <Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="p-6 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Navn *</label>
                      <input value={cfName} onChange={e => setCfName(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="Jens Hansen" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Email *</label>
                      <input value={cfEmail} onChange={e => setCfEmail(e.target.value)} type="email" className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="jens@firma.dk" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Telefon</label>
                      <input value={cfPhone} onChange={e => setCfPhone(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="+45 12345678" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Virksomhed</label>
                      <input value={cfCompany} onChange={e => setCfCompany(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="Firma A/S" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Branche</label>
                      <input value={cfIndustry} onChange={e => setCfIndustry(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="Restaurant, Retail, Event..." />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">By</label>
                      <input value={cfCity} onChange={e => setCfCity(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="København" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tags (kommasepareret)</label>
                    <input value={cfTags} onChange={e => setCfTags(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" placeholder="restaurant, premium, event" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Noter</label>
                    <textarea value={cfNotes} onChange={e => setCfNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none resize-none" placeholder="Interne noter om kontakten..." />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={resetContactForm} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Annuller</button>
                  <button onClick={saveContact} disabled={savingContact} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2">
                    {savingContact ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
                        Gemmer...
                      </>
                    ) : (
                      editingContact ? "Gem ændringer" : "Opret kontakt"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CAMPAIGNS ═══ */}
      {subTab === "campaigns" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Kampagner</h2>
              <p className="text-sm text-slate-500 mt-0.5">Opret og send OOH-oplæg til flere kunder på én gang</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { resetCampaignForm(); setShowCampaignForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl shadow-sm">
                <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Ny kampagne
              </button>
            </div>
          </div>

          {/* AI Agent: Smart Campaign Suggestions */}
          <div className="mb-5 bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200/60 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                <Ic d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 mb-1">AI Kampagne-forslag</h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  AI analyserer dine kontakter og frames og foreslår kampagner med personlige emails.
                </p>
                <input
                  value={aiMatchContext}
                  onChange={e => setAiMatchContext(e.target.value)}
                  placeholder="Valgfri kontekst, f.eks. 'Fokuser på restauranter i Aarhus'..."
                  className="w-full px-3 py-1.5 text-xs border border-indigo-200 rounded-lg mb-2 bg-white/80 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
                <button
                  onClick={runAiMatch}
                  disabled={aiMatching || contacts.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-[11px] font-semibold rounded-lg shadow-sm"
                >
                  {aiMatching ? (
                    <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />AI analyserer...</>
                  ) : (
                    <><Ic d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-3 h-3" />Generer AI-forslag</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Search + filter */}
          {campaigns.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={campaignSearch}
                  onChange={e => setCampaignSearch(e.target.value)}
                  placeholder="Søg kampagner..."
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none"
                />
              </div>
              <select
                value={campaignStatusFilter}
                onChange={e => setCampaignStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-violet-200 outline-none"
              >
                <option value="">Alle status</option>
                <option value="draft">Kladde</option>
                <option value="active">Aktiv</option>
                <option value="completed">Fuldført</option>
              </select>
            </div>
          )}

          {filteredCampaigns.length === 0 && campaigns.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Ingen kampagner endnu</p>
              <p className="text-xs text-slate-400 mt-1">Opret din første kampagne for at starte outreach</p>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm font-medium">Ingen kampagner matcher din søgning</p>
              <button onClick={() => { setCampaignSearch(""); setCampaignStatusFilter(""); }} className="text-xs text-violet-600 hover:underline mt-1">Ryd filtre</button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCampaigns.map(camp => {
                const campSends = sends.filter(s => s.campaignId === camp.id);
                const sentCount = campSends.filter(s => s.status !== "queued" && s.status !== "error").length;
                const openedCount = campSends.filter(s => ["opened", "replied", "meeting", "sold"].includes(s.status)).length;
                const isExpanded = expandedCampaignId === camp.id;

                return (
                  <div key={camp.id} className="bg-white rounded-xl border border-slate-200/80 overflow-hidden hover:shadow-sm transition-all">
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={() => setExpandedCampaignId(isExpanded ? null : camp.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{camp.name}</h3>
                          <StatusBadge status={camp.status} />
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{camp.contactIds.length} kontakter</span>
                          {camp.frameIds.length > 0 && <span>{camp.frameIds.length} frames</span>}
                          {sentCount > 0 && <span className="text-blue-600 font-medium">{sentCount} sendt</span>}
                          {openedCount > 0 && <span className="text-emerald-600 font-medium">{openedCount} åbnet</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {camp.status === "draft" && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); editCampaign(camp); }}
                              className="p-2 hover:bg-slate-100 rounded-lg" title="Rediger">
                              <Ic d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-4 h-4 text-slate-400" />
                            </button>
                            {(!camp.emailSubject || !camp.emailBody) && (
                              <button onClick={(e) => { e.stopPropagation(); generateAiDraft(camp.id); }}
                                disabled={aiDraftingEmail}
                                className="flex items-center gap-1 px-3 py-2 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-lg hover:bg-indigo-200 disabled:opacity-50"
                                title="AI: Generer email">
                                {aiDraftingEmail ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border border-indigo-400 border-t-indigo-700" />
                                ) : (
                                  <Ic d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-3 h-3" />
                                )}
                                AI Email
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); sendCampaign(camp.id); }}
                              disabled={sendingCampaignId === camp.id || !camp.contactIds.length || !camp.emailSubject}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm">
                              {sendingCampaignId === camp.id ? (
                                <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />Sender...</>
                              ) : (
                                <><Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-3 h-3" />Send kampagne</>
                              )}
                            </button>
                          </>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); deleteCampaign(camp.id); }}
                          className="p-2 hover:bg-red-50 rounded-lg" title="Slet">
                          <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4 text-slate-300 hover:text-red-500" />
                        </button>
                        <Ic d={isExpanded ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"} className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>

                    {/* Expanded send details */}
                    {isExpanded && campSends.length > 0 && (
                      <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Afsendelser</h4>
                        <div className="space-y-1.5">
                          {campSends.map(s => (
                            <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{s.contactName || "Ukendt"}</p>
                                <p className="text-[10px] text-slate-400">{s.contactEmail} · {s.contactCompany}</p>
                              </div>
                              <StatusBadge status={s.status} />
                              {s.sentAt && <span className="text-[10px] text-slate-400">{new Date(s.sentAt).toLocaleDateString("da-DK")}</span>}
                              <select
                                value={s.status}
                                onChange={(e) => updateSendStatus(s.id, e.target.value)}
                                className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-slate-600"
                              >
                                <option value="sent">Sendt</option>
                                <option value="opened">Åbnet</option>
                                <option value="replied">Besvaret</option>
                                <option value="meeting">Møde</option>
                                <option value="sold">Solgt</option>
                                <option value="rejected">Afvist</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Campaign Form Modal */}
          {showCampaignForm && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => resetCampaignForm()}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-lg font-bold text-slate-900">{editingCampaign ? "Rediger kampagne" : "Ny kampagne"}</h3>
                  <button onClick={resetCampaignForm} className="p-1 hover:bg-slate-100 rounded-lg">
                    <Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Campaign name */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Kampagnenavn *</label>
                    <input value={campName} onChange={e => setCampName(e.target.value)}
                      className={`mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none ${campErrors.includes("name") && campName === "" ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}
                      placeholder="Q1 2026 – Gavlnetværk Aarhus" />
                  </div>

                  {/* Network / Frames selection */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Netværk / Frames</label>
                    {networks.length > 0 && (
                      <div className="mb-2">
                        <select value={campNetworkId} onChange={e => selectNetwork(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none">
                          <option value="">Vælg netværk (valgfrit)</option>
                          {networks.map(n => (
                            <option key={n.id} value={n.id}>{n.name} ({n.frameIds.length} frames)</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {frames.map(f => (
                        <button key={f.id} onClick={() => setCampFrameIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                          className={`px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-all ${campFrameIds.includes(f.id) ? "bg-violet-100 border-violet-300 text-violet-700" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"}`}>
                          {f.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{campFrameIds.length} frames valgt</p>
                  </div>

                  {/* Creative selection */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Creative</label>
                    <select value={campCreativeId} onChange={e => setCampCreativeId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none">
                      <option value="">Vælg creative</option>
                      {creatives.map(c => (
                        <option key={c.id} value={c.id}>{c.companyName || c.filename}</option>
                      ))}
                    </select>
                  </div>

                  {/* Template selection */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Oplæg-skabelon</label>
                    <select value={campTemplateId} onChange={e => setCampTemplateId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none">
                      <option value="">Vælg skabelon (valgfrit)</option>
                      {presTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.pageCount} sider)</option>
                      ))}
                    </select>
                  </div>

                  {/* Contact selection */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Kontakter</label>
                    {contacts.length === 0 ? (
                      <p className="text-xs text-slate-400">Ingen kontakter endnu. Opret kontakter under Kontakter-fanen først.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                        {contacts.map(c => (
                          <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 ${campContactIds.includes(c.id) ? "bg-violet-50" : ""}`}>
                            <input type="checkbox" checked={campContactIds.includes(c.id)} onChange={() => toggleCampContact(c.id)}
                              className="w-3.5 h-3.5 accent-violet-600" />
                            <span className="text-xs text-slate-800 font-medium">{c.name}</span>
                            <span className="text-[10px] text-slate-400">{c.email}</span>
                            {c.company && <span className="text-[10px] text-slate-400">· {c.company}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                    <p className={`text-[10px] mt-1 ${campErrors.includes("contacts") && campContactIds.length === 0 ? "text-red-500 font-semibold" : "text-slate-400"}`}>{campContactIds.length} kontakter valgt{campErrors.includes("contacts") && campContactIds.length === 0 ? " – vælg mindst én kontakt" : ""}</p>
                  </div>

                  {/* Email content */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Email emne *</label>
                    <input value={campSubject} onChange={e => setCampSubject(e.target.value)}
                      className={`mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none ${campErrors.includes("subject") && campSubject === "" ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}
                      placeholder="OOH-mulighed for {company} – {city}" />
                    <p className="text-[10px] text-slate-400 mt-0.5">Brug {"{name}"}, {"{company}"}, {"{city}"} som variabler</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Email indhold *</label>
                    <textarea value={campBody} onChange={e => setCampBody(e.target.value)} rows={6}
                      className={`mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none resize-none ${campErrors.includes("body") && campBody === "" ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}
                      placeholder={"Hej {name},\n\nVi har en spændende OOH-mulighed til {company}...\n\nVenlig hilsen\nHyde Media"} />
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                  <button onClick={resetCampaignForm} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Annuller</button>
                  <div className="flex gap-2">
                    <button onClick={saveCampaign} disabled={savingCampaign}
                      className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2">
                      {savingCampaign ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
                          Gemmer...
                        </>
                      ) : (
                        editingCampaign ? "Gem ændringer" : "Opret kampagne"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SENDS HISTORY ═══ */}
      {subTab === "sends" && (
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">Afsendelseshistorik</h2>
            <p className="text-sm text-slate-500 mt-0.5">Oversigt over alle sendte oplæg og deres status</p>
          </div>

          {sends.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Ingen afsendelser endnu</p>
              <p className="text-xs text-slate-400 mt-1">Send din første kampagne for at se historik her</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Kontakt</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Virksomhed</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Sendt</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Opfølgning</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{s.contactName || "Ukendt"}</p>
                        <p className="text-[10px] text-slate-400">{s.contactEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.contactCompany || "–"}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-slate-500">
                        {s.sentAt ? new Date(s.sentAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short" }) : "–"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {s.nextFollowUpAt ? (
                          <span className={new Date(s.nextFollowUpAt) <= new Date() ? "text-amber-600 font-medium" : ""}>
                            {new Date(s.nextFollowUpAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}
                          </span>
                        ) : "–"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={s.status}
                          onChange={(e) => updateSendStatus(s.id, e.target.value)}
                          className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-slate-600"
                        >
                          <option value="sent">Sendt</option>
                          <option value="opened">Åbnet</option>
                          <option value="replied">Besvaret</option>
                          <option value="meeting">Møde</option>
                          <option value="sold">Solgt</option>
                          <option value="rejected">Afvist</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ FOLLOW-UPS ═══ */}
      {subTab === "followups" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Opfølgninger</h2>
              <p className="text-sm text-slate-500 mt-0.5">Kontakter der skal følges op på – {dueFollowUps.length} forfaldne</p>
            </div>
            {dueFollowUps.length > 0 && (
              <button
                onClick={generateFollowUpDrafts}
                disabled={generatingFollowUpDrafts}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-sm"
              >
                {generatingFollowUpDrafts ? (
                  <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />AI genererer udkast...</>
                ) : (
                  <><Ic d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-3 h-3" />AI: Generer alle opfølgninger</>
                )}
              </button>
            )}
          </div>

          {/* AI Follow-up Drafts (Approval Queue) */}
          {aiFollowUpDrafts.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Ic d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-3.5 h-3.5" />
                AI-genererede udkast – Godkend eller afvis ({aiFollowUpDrafts.length})
              </h3>
              <div className="space-y-3">
                {aiFollowUpDrafts.map(draft => (
                  <div key={draft.sendId} className="bg-white rounded-xl border border-indigo-200/80 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-indigo-50/50 border-b border-indigo-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{draft.contactName}</p>
                          <p className="text-[10px] text-slate-500">{draft.contactEmail} · Opfølgning #{draft.followUpNumber}</p>
                        </div>
                        <StatusBadge status="pending_approval" />
                      </div>
                    </div>
                    <div className="px-5 py-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Emne</p>
                      <p className="text-xs text-slate-800 mb-3 font-medium">{draft.subject}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Indhold</p>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{draft.body}</p>
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => setAiFollowUpDrafts(prev => prev.filter(d => d.sendId !== draft.sendId))}
                        className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">
                        Afvis
                      </button>
                      <button
                        onClick={() => sendAiFollowUp(draft)}
                        disabled={sendingFollowUp === draft.sendId}
                        className="flex items-center gap-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[10px] font-semibold rounded-lg shadow-sm"
                      >
                        {sendingFollowUp === draft.sendId ? (
                          <><div className="animate-spin rounded-full h-2.5 w-2.5 border border-white/30 border-t-white" />Sender...</>
                        ) : (
                          <><Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />Godkend & send</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dueFollowUps.length === 0 && aiFollowUpDrafts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Ic d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Ingen forfaldne opfølgninger</p>
              <p className="text-xs text-slate-400 mt-1">Alle afsendelser er opdaterede</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dueFollowUps.map(s => {
                const daysSinceSent = s.sentAt ? Math.floor((Date.now() - new Date(s.sentAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4 bg-white rounded-xl border border-amber-200/80 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-amber-700">
                      <Ic d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-900">{s.contactName}</p>
                        <span className="text-[10px] text-slate-400">· {s.contactCompany}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">{s.contactEmail}</p>
                      <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                        Sendt for {daysSinceSent} dage siden · Opfølgning #{s.followUpCount + 1}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => sendFollowUp(s.id)}
                        disabled={sendingFollowUp === s.id}
                        className="px-3 py-1.5 bg-amber-500 text-white text-[10px] font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1">
                        {sendingFollowUp === s.id ? (
                          <><div className="animate-spin rounded-full h-2.5 w-2.5 border border-white/30 border-t-white" />Sender...</>
                        ) : (
                          <><Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-2.5 h-2.5" />Send opfølgning</>
                        )}
                      </button>
                      <button
                        onClick={() => updateSendStatus(s.id, "replied")}
                        className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg hover:bg-emerald-200">
                        Besvaret
                      </button>
                      <button
                        onClick={() => updateSendStatus(s.id, "meeting")}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-lg hover:bg-blue-200">
                        Møde booket
                      </button>
                      <button
                        onClick={() => updateSendStatus(s.id, "rejected")}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded-lg hover:bg-red-200">
                        Afvist
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ SEND PREVIEW MODAL ═══ */}
      {sendPreviewCampaign && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSendPreviewCampaign(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Bekræft afsendelse</h3>
              <button onClick={() => setSendPreviewCampaign(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Campaign info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shrink-0">
                  <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{sendPreviewCampaign.name}</p>
                  <p className="text-xs text-slate-400">{sendPreviewCampaign.contactIds.length} modtagere</p>
                </div>
              </div>

              {/* Recipients */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Modtagere ({sendPreviewCampaign.contactIds.length})</p>
                <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-50 rounded-xl p-2">
                  {sendPreviewCampaign.contactIds.map(cid => {
                    const contact = contacts.find(c => c.id === cid);
                    return contact ? (
                      <div key={cid} className="flex items-center gap-2 px-2 py-1">
                        <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[8px] font-bold text-violet-700 shrink-0">{contact.name.charAt(0)}</div>
                        <span className="text-xs text-slate-700">{contact.name}</span>
                        <span className="text-[10px] text-slate-400">{contact.email}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Email preview */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Email-forhåndsvisning</p>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-xs font-bold text-slate-800 mb-2">Emne: {sendPreviewCampaign.emailSubject || "—"}</p>
                  <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {sendPreviewCampaign.emailBody || <span className="italic text-slate-400">Ingen email-indhold</span>}
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {(!sendPreviewCampaign.emailSubject || !sendPreviewCampaign.emailBody) && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                  <Ic d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-[10px] text-amber-800 font-medium">Email emne eller indhold mangler. Kampagnen kan ikke sendes uden begge.</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setSendPreviewCampaign(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Annuller</button>
              <button
                onClick={confirmSendCampaign}
                disabled={!sendPreviewCampaign.emailSubject || !sendPreviewCampaign.emailBody || sendPreviewCampaign.contactIds.length === 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2"
              >
                <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-4 h-4" />
                Send til {sendPreviewCampaign.contactIds.length} kontakter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        detail={confirmModal.detail}
        variant={confirmModal.variant}
        confirmLabel={confirmModal.confirmLabel}
        loading={confirmModal.loading}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
