// ============================================================
// Property Feedback Endpoint
// POST /api/feedback
// Records user feedback on a property (e.g., "irrelevant", "wrong owner")
// Saves as a note in HubSpot and updates a custom field
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { updateEjendom } from "@/lib/hubspot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { propertyId, feedback, note } = body as {
      propertyId: string;
      feedback: string;
      note?: string;
    };

    if (!propertyId || !feedback) {
      return NextResponse.json(
        { error: "Missing propertyId or feedback" },
        { status: 400 }
      );
    }

    // Valid feedback types
    const validFeedback = [
      "irrelevant",       // Not relevant for outdoor advertising
      "too_small",        // Facade too small
      "wrong_owner",      // Owner info is incorrect
      "wrong_contact",    // Contact person is incorrect
      "already_contacted",// Already contacted via other channel
      "duplicate",        // Duplicate of another property
      "good_lead",        // Confirmed as a good lead
      "needs_reresearch", // Needs another round of research
    ];

    if (!validFeedback.includes(feedback)) {
      return NextResponse.json(
        { error: `Invalid feedback. Valid: ${validFeedback.join(", ")}` },
        { status: 400 }
      );
    }

    // Update the property with feedback
    const feedbackValue = note ? `${feedback}: ${note}` : feedback;
    const timestamp = new Date().toISOString();

    await updateEjendom(propertyId, {
      user_feedback: feedbackValue,
      user_feedback_at: timestamp,
    });

    return NextResponse.json({
      success: true,
      propertyId,
      feedback: feedbackValue,
      timestamp,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
