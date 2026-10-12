import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getMeeting } from "@/server/services/meetings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { MeetingForm } from "@/features/meetings/meeting-form";
import { meetingFormOptions } from "@/features/meetings/options";
import { toDateInput, toDateTimeInput } from "@/lib/dates";

export const metadata: Metadata = { title: "Edit meeting" };

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("meeting.edit");
  const { id } = await params;
  const [m, opts] = await Promise.all([orNotFound(getMeeting(ctx, id)), meetingFormOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${m.title}`} breadcrumbs={[{ label: "Meetings & MOM", href: "/meetings" }, { label: m.number, href: `/meetings/${m.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <MeetingForm
          mode="edit"
          defaults={{
            id: m.id,
            title: m.title,
            scheduledAt: toDateTimeInput(m.scheduledAt, ctx.org.timezone),
            durationMins: String(m.durationMins),
            type: m.type,
            status: m.status,
            location: m.location ?? "",
            agenda: m.agenda ?? "",
            accountId: m.accountId ?? "",
            leadId: m.leadId ?? "",
            contactIds: m.contacts.map((c) => c.contactId),
            assignedToId: m.assignedToId,
            nextFollowUpAt: toDateInput(m.nextFollowUpAt),
          }}
          {...opts}
          canAssign={ctx.can("meeting.assign")}
          cancelHref={`/meetings/${m.id}`}
          timeZone={ctx.org.timezone}
        />
      </div>
    </>
  );
}
