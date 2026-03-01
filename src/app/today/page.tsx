import MedChecklist from "@/components/checklist/MedChecklist";

export const metadata = {
    title: "Today's Medications \u2013 BuckMed",
    description: "Your real-time medication checklist for today.",
};

export default function TodayPage() {
    return <MedChecklist />;
}
