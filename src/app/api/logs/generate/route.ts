import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { format, addDays, parseISO, differenceInDays, max, min } from "date-fns";

// Maximum days into the future we'll pre-generate logs for open-ended medications
const MAX_FUTURE_DAYS = 90;

interface MedData {
    patient_id: string;
    group_id: string;
    times: string[];
    name: string;
    dosage: string;
    frequency: string;
    notes?: string | null;
    start_date: string;   // "yyyy-MM-dd"
    end_date?: string | null;
    [key: string]: unknown;
}

/**
 * Compute the range of dates to generate logs for:
 *   - Start: max(medication.start_date, today)
 *   - End:   min(medication.end_date, today + MAX_FUTURE_DAYS)
 *   Returns an array of "yyyy-MM-dd" strings.
 */
function buildDateRange(medData: MedData): string[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = max([parseISO(medData.start_date), today]);

    let endDate: Date;
    if (medData.end_date) {
        endDate = min([parseISO(medData.end_date), addDays(today, MAX_FUTURE_DAYS)]);
    } else {
        endDate = addDays(today, MAX_FUTURE_DAYS);
    }

    if (endDate < startDate) return [];

    const totalDays = differenceInDays(endDate, startDate) + 1;
    return Array.from({ length: totalDays }, (_, i) =>
        format(addDays(startDate, i), "yyyy-MM-dd")
    );
}

/**
 * POST /api/logs/generate
 * Generates medication_logs for a medication for all days within its date range.
 * Respects start_date and end_date fields. Idempotent — skips existing documents.
 */
export async function POST(req: NextRequest) {
    const { medication_id } = await req.json();

    if (!medication_id) {
        return NextResponse.json({ error: "medication_id required" }, { status: 400 });
    }

    const db = getAdminDb();

    const medDoc = await db.collection("medications").doc(medication_id).get();
    if (!medDoc.exists) {
        return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    const medData = medDoc.data() as MedData;

    let patientName = "Unknown Patient";
    if (medData.patient_id) {
        const patientDoc = await db.collection("patients").doc(medData.patient_id).get();
        if (patientDoc.exists) {
            patientName = (patientDoc.data() as { name: string }).name;
        }
    }

    const dates = buildDateRange(medData);
    if (dates.length === 0) {
        return NextResponse.json({ ok: true, generated: 0, reason: "no dates in range" });
    }

    // Firestore batch limit is 500 — chunk if needed
    const BATCH_SIZE = 400;
    let total = 0;

    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
        const chunk = dates.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        let count = 0;

        for (const date of chunk) {
            for (const time of medData.times) {
                const logId = `${medication_id}_${date}_${time.replace(":", "")}`;
                const logRef = db.collection("medication_logs").doc(logId);
                const existing = await logRef.get();
                if (!existing.exists) {
                    batch.set(logRef, {
                        group_id: medData.group_id,
                        medication_id,
                        patient_id: medData.patient_id,
                        caregiver_id: null,
                        scheduled_date: date,
                        scheduled_time: time,
                        completed_at: null,
                        created_at: new Date().toISOString(),
                        medication: {
                            ...medData,
                            id: medication_id,
                            patient: { id: medData.patient_id, name: patientName },
                        },
                    });
                    count++;
                }
            }
        }

        if (count > 0) await batch.commit();
        total += count;
    }

    return NextResponse.json({ ok: true, generated: total, days: dates.length });
}

/**
 * PUT /api/logs/generate
 * Full sync when a medication is edited:
 *   1. Deletes pending logs for times that were REMOVED
 *   2. Updates metadata (name, dosage, etc.) in pending logs for KEPT times
 *   3. Creates new logs for ADDED times or dates (idempotent)
 * Uses Admin SDK — bypasses Firestore client security rules.
 */
export async function PUT(req: NextRequest) {
    const { medication_id } = await req.json();

    if (!medication_id) {
        return NextResponse.json({ error: "medication_id required" }, { status: 400 });
    }

    const db = getAdminDb();

    const medDoc = await db.collection("medications").doc(medication_id).get();
    if (!medDoc.exists) {
        return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    const medData = medDoc.data() as MedData;
    const newTimesSet = new Set<string>(medData.times);

    // Sync existing pending logs
    const logsSnap = await db
        .collection("medication_logs")
        .where("medication_id", "==", medication_id)
        .where("completed_at", "==", null)
        .get();

    let deleted = 0;
    let updated = 0;

    if (!logsSnap.empty) {
        const BATCH_SIZE = 400;
        const docs = logsSnap.docs;

        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const chunk = docs.slice(i, i + BATCH_SIZE);
            const syncBatch = db.batch();

            chunk.forEach((logDoc) => {
                const scheduledTime: string = logDoc.data().scheduled_time;
                if (!newTimesSet.has(scheduledTime)) {
                    syncBatch.delete(logDoc.ref);
                    deleted++;
                } else {
                    syncBatch.update(logDoc.ref, {
                        "medication.name": medData.name,
                        "medication.dosage": medData.dosage,
                        "medication.frequency": medData.frequency,
                        "medication.times": medData.times,
                        "medication.notes": medData.notes ?? null,
                        "medication.start_date": medData.start_date,
                        "medication.end_date": medData.end_date ?? null,
                    });
                    updated++;
                }
            });

            await syncBatch.commit();
        }
    }

    // Fetch patient for denormalization
    let patientName = "Unknown Patient";
    if (medData.patient_id) {
        const patientDoc = await db.collection("patients").doc(medData.patient_id).get();
        if (patientDoc.exists) {
            patientName = (patientDoc.data() as { name: string }).name;
        }
    }

    // Create new logs for the full date range (idempotent)
    const dates = buildDateRange(medData);
    let created = 0;

    const BATCH_SIZE = 400;
    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
        const chunk = dates.slice(i, i + BATCH_SIZE);
        const createBatch = db.batch();
        let count = 0;

        for (const date of chunk) {
            for (const time of medData.times) {
                const logId = `${medication_id}_${date}_${time.replace(":", "")}`;
                const logRef = db.collection("medication_logs").doc(logId);
                const existing = await logRef.get();
                if (!existing.exists) {
                    createBatch.set(logRef, {
                        group_id: medData.group_id,
                        medication_id,
                        patient_id: medData.patient_id,
                        caregiver_id: null,
                        scheduled_date: date,
                        scheduled_time: time,
                        completed_at: null,
                        created_at: new Date().toISOString(),
                        medication: {
                            ...medData,
                            id: medication_id,
                            patient: { id: medData.patient_id, name: patientName },
                        },
                    });
                    count++;
                }
            }
        }

        if (count > 0) await createBatch.commit();
        created += count;
    }

    return NextResponse.json({ ok: true, deleted, updated, created, days: dates.length });
}
