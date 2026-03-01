// ─── Database Types ────────────────────────────────────────────────────────────
export type Patient = {
    id: string;
    name: string;
    type: "human" | "pet";
    species?: string; // for pets
    birth_date?: string;
    notes?: string;
    created_at: string;
};

export type Caregiver = {
    id: string;
    name: string;
    phone: string; // WhatsApp number in E.164 format e.g. +15551234567
    email?: string;
    google_refresh_token?: string;
    created_at: string;
};

export type Medication = {
    id: string;
    patient_id: string;
    group_id?: string;
    name: string;
    dosage: string;
    /** Daily-style frequencies use `times[]`. Interval uses `interval_hours` + `next_dose_at`. */
    frequency: "daily" | "twice_daily" | "three_times_daily" | "weekly" | "custom" | "interval";
    times: string[];          // HH:MM array — used when frequency !== 'interval'
    interval_hours?: number;  // e.g. 48, 72  — used when frequency === 'interval'
    first_dose_at?: string;   // ISO datetime for the very first dose of an interval med
    next_dose_at?: string;    // ISO datetime — when the next dose is due
    last_taken_at?: string;   // ISO datetime — last time dose was marked done
    start_date: string;
    end_date?: string;
    notes?: string;
    created_at: string;
    patient?: Patient;
};

export type MedicationLog = {
    id: string;
    medication_id: string;
    caregiver_id: string;
    scheduled_date: string; // YYYY-MM-DD
    scheduled_time: string; // HH:MM
    completed_at: string | null;
    created_at: string;
    medication?: Medication;
    caregiver?: Caregiver;
};

// ─── API Response Types ────────────────────────────────────────────────────────
export type ApiResponse<T> =
    | { data: T; error: null }
    | { data: null; error: string };

// ─── Real-time Payload Types ────────────────────────────────────────────────────
export type MedLogRealtimePayload = {
    new: MedicationLog;
    old: MedicationLog;
    eventType: "INSERT" | "UPDATE" | "DELETE";
};
