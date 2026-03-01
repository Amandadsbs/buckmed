import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * GET /api/meds/active
 * Returns all medications that are still active (no end_date or end_date >= today).
 * Used by the standalone cron script at midnight to generate daily logs.
 *
 * Requires header: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    const today = new Date().toISOString().split("T")[0];

    // Firestore doesn't support OR queries natively; use two queries + merge
    const [noEndSnap, futureEndSnap] = await Promise.all([
        db.collection("medications").where("end_date", "==", null).get(),
        db.collection("medications").where("end_date", ">=", today).get(),
    ]);

    const meds = [
        ...noEndSnap.docs.map((d) => ({ id: d.id })),
        ...futureEndSnap.docs.map((d) => ({ id: d.id })),
    ];

    // Deduplicate (in case a doc matches both somehow – shouldn't happen, but safe)
    const seen = new Set<string>();
    const unique = meds.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

    return NextResponse.json({ ok: true, meds: unique });
}
