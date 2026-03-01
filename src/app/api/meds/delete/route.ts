import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * DELETE /api/meds/delete
 * Cascade-deletes a medication and ALL its associated medication_logs.
 * Uses Admin SDK to bypass Firestore client rules and supports batched deletes.
 */
export async function DELETE(req: NextRequest) {
    const { medication_id } = await req.json();

    if (!medication_id || typeof medication_id !== "string") {
        return NextResponse.json({ error: "medication_id required" }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. Verify the medication exists
    const medRef = db.collection("medications").doc(medication_id);
    const medSnap = await medRef.get();
    if (!medSnap.exists) {
        // Already gone — still return success so the UI can proceed
        return NextResponse.json({ ok: true, deleted_logs: 0, note: "medication already deleted" });
    }

    // 2. Find all associated logs (both pending and completed)
    const logsSnap = await db
        .collection("medication_logs")
        .where("medication_id", "==", medication_id)
        .get();

    const totalLogs = logsSnap.size;
    console.log(`[cascade-delete] Deleting ${totalLogs} logs for medication ${medication_id}`);

    // 3. Delete logs in batches of 400 (Firestore max batch = 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < logsSnap.docs.length; i += BATCH_SIZE) {
        const chunk = logsSnap.docs.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }

    // 4. Delete the medication document itself
    await medRef.delete();

    console.log(`[cascade-delete] ✅ Medication ${medication_id} + ${totalLogs} logs deleted`);
    return NextResponse.json({ ok: true, deleted_logs: totalLogs });
}
