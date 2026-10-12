import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { PageHeader } from "@/components/data/page-header";
import { MeetingForm } from "@/features/meetings/meeting-form";
import { meetingFormOptions } from "@/features/meetings/options";
import { defaultMeetingStart, toDateTimeInput } from "@/lib/dates";

export const metadata: Metadata = { title: "New meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ accountId?: string; leadId?: string }> }) {
  const ctx = await pageContext("meeting.create");
  const sp = await searchParams;
  const opts = await meetingFormOptions(ctx);
  const lead = opts.leads.find((l) => l.value === sp.leadId);
  const accountId = opts.accounts.some((a) => a.value === sp.accountId) ? sp.accountId! : (lead?.accountId ?? "");
  const start = defaultMeetingStart();
  return (
    <>
      <PageHeader title="New meeting" breadcrumbs={[{ label: "Meetings & MOM", href: "/meetings" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <MeetingForm
          mode="create"
          defaults={{ assignedToId: ctx.userId, accountId, leadId: lead?.value ?? "", scheduledAt: toDateTimeInput(start, ctx.org.timezone), title: lead ? `Discussion — ${lead.hint}` : "" }}
          {...opts}
          canAssign={ctx.can("meeting.assign")}
          cancelHref="/meetings"
          timeZone={ctx.org.timezone}
        />
      </div>
    </>
  );
}
