import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { google } from "googleapis";
import { addDays } from "date-fns";

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

/**
 * POST /api/calendar/sync
 * Creates Google Calendar events for a medication schedule.
 * Requires the caregiver to have already authorized Google OAuth.
 */
export async function POST(req: NextRequest) {
    const { medication_id } = await req.json();

    if (!medication_id) {
        return NextResponse.json({ error: "medication_id required" }, { status: 400 });
    }

    const db = getAdminDb();

    // Fetch medication document
    const medDoc = await db.collection("medications").doc(medication_id).get();
    if (!medDoc.exists) {
        return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }
    const med = { id: medDoc.id, ...medDoc.data() } as {
        id: string;
        name: string;
        dosage: string;
        notes?: string;
        times: string[];
        start_date: string;
        end_date?: string;
        frequency: string;
        patient_id: string;
    };

    // Fetch patient name
    const patientDoc = await db.collection("patients").doc(med.patient_id).get();
    const patientName = patientDoc.exists ? (patientDoc.data() as { name: string }).name : "Unknown";

    // Fetch caregivers with a Google refresh token
    const caregiversSnap = await db
        .collection("caregivers")
        .where("google_refresh_token", "!=", null)
        .get();

    if (caregiversSnap.empty) {
        return NextResponse.json({ ok: false, message: "No caregivers with Google auth found" });
    }

    const results: { caregiver: string; eventIds: string[] }[] = [];

    for (const cgDoc of caregiversSnap.docs) {
        const caregiver = { id: cgDoc.id, ...cgDoc.data() } as unknown as {
            id: string;
            name: string;
            google_refresh_token: string;
        };

        try {
            oauth2Client.setCredentials({ refresh_token: caregiver.google_refresh_token });
            const calendar = google.calendar({ version: "v3", auth: oauth2Client });

            const eventIds: string[] = [];
            const startDate = new Date(med.start_date);
            const endDate = med.end_date ? new Date(med.end_date) : addDays(startDate, 30);

            for (const time of med.times) {
                const [hours, minutes] = time.split(":").map(Number);
                let current = new Date(startDate);

                while (current <= endDate) {
                    const start = new Date(current);
                    start.setHours(hours, minutes, 0, 0);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + 15);

                    const event = await calendar.events.insert({
                        calendarId: "primary",
                        requestBody: {
                            summary: `💊 ${med.name} – ${med.dosage}`,
                            description: `Patient: ${patientName}\nDosage: ${med.dosage}\nNotes: ${med.notes ?? "—"}\n\nManaged by BuckMed`,
                            start: { dateTime: start.toISOString() },
                            end: { dateTime: end.toISOString() },
                            reminders: {
                                useDefault: false,
                                overrides: [{ method: "popup", minutes: 10 }],
                            },
                            colorId: "3", // Sage green
                        },
                    });

                    if (event.data.id) eventIds.push(event.data.id);

                    // Advance by frequency
                    current = addDays(current, med.frequency === "weekly" ? 7 : 1);
                }
            }

            results.push({ caregiver: caregiver.name, eventIds });
        } catch (err: any) {
            console.error(`[Calendar] Error for caregiver ${caregiver.name}:`, err.message);
        }
    }

    return NextResponse.json({ ok: true, results });
}

/**
 * GET /api/calendar/sync?code=...&state=<caregiverId>
 * OAuth callback to save the refresh token to Firestore.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const caregiverId = searchParams.get("state");

    if (!code || !caregiverId) {
        return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        const db = getAdminDb();

        await db.collection("caregivers").doc(caregiverId).update({
            google_refresh_token: tokens.refresh_token,
        });

        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/calendar?success=true`);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
