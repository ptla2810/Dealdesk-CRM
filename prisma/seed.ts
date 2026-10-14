/**
 * Reproducible DEMO data for local development.
 *
 *   npm run db:seed          # seeds an empty database
 *   npm run db:reset         # drops, migrates and re-seeds (destructive)
 *
 * Everything created here is fictional and labelled "(Demo)". A deterministic PRNG is
 * used so every run produces the same dataset relative to the current date.
 * All demo users share the password printed at the end — never use these in production.
 */
import { PrismaClient, type LeadStage, type OrderStatus, type DeliveryStatus, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, DEFAULT_ROLE_GRANTS, PERMISSIONS } from "../src/lib/permissions";
import { DEFAULT_LEAD_SOURCES, LEAD_STAGES } from "../src/lib/constants";
import { computeLine, computeOrder } from "../src/lib/order-math";
import { normalizeCompanyName } from "../src/lib/normalize";
import { DEFAULT_ORDER_TRANSITIONS } from "../src/lib/settings";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345";
const DAY = 86_400_000;

// Deterministic PRNG (mulberry32)
let seed = 20261012;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const utcDate = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const now = new Date();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now.getTime() - n * DAY);
  d.setUTCHours(hour, int(0, 59), 0, 0);
  return d;
};
const pad = (n: number) => String(n).padStart(5, "0");

async function seedPermissions() {
  for (const key of ALL_PERMISSIONS) {
    const [module, action] = key.split(".") as [string, string];
    await prisma.permission.upsert({
      where: { key },
      create: { key, module, action, description: PERMISSIONS[key] },
      update: { module, action, description: PERMISSIONS[key] },
    });
  }
}

async function createOrg(name: string, slug: string, baseCurrency: string, timezone: string) {
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      baseCurrency,
      timezone,
      settings: {
        leadWorkflow: { allowSkipStages: false, allowBackward: true, allowReopenConverted: false },
        orderWorkflow: { transitions: DEFAULT_ORDER_TRANSITIONS },
        pricing: { discountsEnabled: true, maxDiscountPercent: 30, taxEnabled: true },
        tickets: { requireResolutionNote: true },
      },
    },
  });
  const roles: Record<string, string> = {};
  for (const [key, def] of Object.entries(DEFAULT_ROLE_GRANTS)) {
    const role = await prisma.role.create({
      data: {
        organizationId: org.id,
        key,
        name: def.name,
        description: def.description,
        isSystem: true,
        dataScope: def.dataScope,
        permissions: { create: [...new Set(def.permissions)].map((permissionKey) => ({ permissionKey })) },
      },
    });
    roles[key] = role.id;
  }
  return { org, roles };
}

async function counter(orgId: string, key: string, value: number) {
  await prisma.counter.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value },
    update: { value },
  });
}

async function main() {
  const existing = await prisma.organization.count();
  if (existing > 0) {
    console.log("Database already contains data — skipping seed. Run `npm run db:reset` to rebuild the demo dataset.");
    return;
  }
  console.log("Seeding demo data …");
  await seedPermissions();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ─── Tenant 1: main demo organization ─────────────────────────────────────
  const { org, roles } = await createOrg("Pankaj Consulting LLC", "northwind-demo", "USD", "Asia/Kolkata");
  const mkUser = (name: string, email: string, role: string, jobTitle: string, username?: string) =>
    prisma.user.create({ data: { organizationId: org.id, roleId: roles[role]!, name, email, username, jobTitle, passwordHash } });

  const admin = await mkUser("Pankaj Tiwari", "admin@salesflow.demo", "ADMIN", "Head of Operations", "admin");
  const manager = await mkUser("Rohan Mehta", "manager@salesflow.demo", "SALES_MANAGER", "Sales Manager", "rohan");
  const rep1 = await mkUser("Priya Nair", "priya@salesflow.demo", "SALES_REP", "Account Executive", "priya");
  const rep2 = await mkUser("Daniel Brooks", "daniel@salesflow.demo", "SALES_REP", "Account Executive", "daniel");
  const rep3 = await mkUser("Meera Iyer", "meera@salesflow.demo", "SALES_REP", "Business Development Rep", "meera");
  const support = await mkUser("Sam Okafor", "support@salesflow.demo", "SUPPORT_AGENT", "Customer Support Lead", "sam");
  const support2 = await mkUser("Lena Fischer", "lena@salesflow.demo", "SUPPORT_AGENT", "Support Agent", "lena");
  // Reporting structure: managers see records owned by everyone below them.
  // Meera reports to Priya, so a sales rep (OWN scope) also sees her team member's records.
  for (const [u, m] of [[manager, admin], [support, admin], [rep1, manager], [rep2, manager], [rep3, rep1], [support2, support]] as const) {
    await prisma.user.update({ where: { id: u.id }, data: { managerId: m.id } });
  }
  const reps = [rep1, rep2, rep3, manager];

  const sources = await Promise.all(
    DEFAULT_LEAD_SOURCES.map((name, i) => prisma.leadSource.create({ data: { organizationId: org.id, name, isSystem: true, sortOrder: i } })),
  );
  await prisma.leadSource.create({ data: { organizationId: org.id, name: "Partner Referral", sortOrder: 10 } });

  const categories = await Promise.all(
    ["Industrial Pumps", "Valves & Fittings", "Safety Equipment", "Power Tools", "Spare Parts", "Services"].map((name) =>
      prisma.productCategory.create({ data: { organizationId: org.id, name } }),
    ),
  );
  const gst18 = await prisma.taxRate.create({ data: { organizationId: org.id, name: "Standard 18%", ratePercent: "18" } });
  const tax5 = await prisma.taxRate.create({ data: { organizationId: org.id, name: "Reduced 5%", ratePercent: "5" } });
  await prisma.taxRate.create({ data: { organizationId: org.id, name: "Exempt 0%", ratePercent: "0" } });

  const productDefs: [string, string, number, string, number, string | null][] = [
    ["Centrifugal Pump CP-200", "PMP-CP200", 0, "Each", 1850, "Standard 18%"],
    ["Submersible Pump SP-75", "PMP-SP75", 0, "Each", 2400, "Standard 18%"],
    ["Diaphragm Pump DP-40", "PMP-DP40", 0, "Each", 1320, "Standard 18%"],
    ["Ball Valve 2\" Stainless", "VLV-BV2SS", 1, "Each", 145, "Standard 18%"],
    ["Gate Valve 4\" Cast Iron", "VLV-GV4CI", 1, "Each", 210, "Standard 18%"],
    ["Pipe Fitting Kit (50 pc)", "FIT-KIT50", 1, "Kit", 95, "Standard 18%"],
    ["Hard Hat — Class E", "SAF-HHCE", 2, "Box of 10", 180, "Reduced 5%"],
    ["Safety Harness Pro", "SAF-HARN", 2, "Each", 260, "Reduced 5%"],
    ["Cut-Resistant Gloves", "SAF-GLV5", 2, "Pack of 12", 72, "Reduced 5%"],
    ["Cordless Impact Drill 20V", "TLS-ID20", 3, "Each", 310, "Standard 18%"],
    ["Angle Grinder 1200W", "TLS-AG12", 3, "Each", 165, "Standard 18%"],
    ["Mechanical Seal Set", "SPR-MSS", 4, "Set", 88, "Standard 18%"],
    ["Impeller Replacement", "SPR-IMP200", 4, "Each", 340, "Standard 18%"],
    ["Annual Maintenance Contract", "SRV-AMC", 5, "Year", 4800, null],
    ["On-site Installation", "SRV-INST", 5, "Visit", 650, null],
  ];
  const products = [];
  for (const [i, [name, sku, cat, uom, price, taxName]] of productDefs.entries()) {
    products.push(
      await prisma.product.create({
        data: {
          organizationId: org.id,
          number: `PRD-${pad(i + 1)}`,
          name,
          sku,
          skuNormalized: sku.toUpperCase(),
          categoryId: categories[cat]!.id,
          shortDescription: `${name} for industrial and commercial applications.`,
          description: `${name}. Demo catalogue item with standard warranty and documentation.`,
          unitOfMeasure: uom,
          listPrice: price.toFixed(2),
          currency: "USD",
          taxRateId: taxName === "Standard 18%" ? gst18.id : taxName === "Reduced 5%" ? tax5.id : null,
          status: i === 2 ? "OUT_OF_STOCK" : "ACTIVE",
          createdById: admin.id,
          modifiedById: admin.id,
          createdAt: daysAgo(400 - i),
        },
      }),
    );
  }
  products.push(
    await prisma.product.create({
      data: {
        organizationId: org.id,
        number: `PRD-${pad(16)}`,
        name: "Legacy Pump LP-10",
        sku: "PMP-LP10",
        skuNormalized: "PMP-LP10",
        categoryId: categories[0]!.id,
        shortDescription: "Discontinued model kept for historic orders.",
        unitOfMeasure: "Each",
        listPrice: "990.00",
        currency: "USD",
        taxRateId: gst18.id,
        status: "INACTIVE",
        createdById: admin.id,
        modifiedById: admin.id,
        createdAt: daysAgo(500),
      },
    }),
    await prisma.product.create({
      data: {
        organizationId: org.id,
        number: `PRD-${pad(17)}`,
        name: "EU Compliance Audit",
        sku: "SRV-EUAUD",
        skuNormalized: "SRV-EUAUD",
        categoryId: categories[5]!.id,
        shortDescription: "Compliance audit service priced in EUR.",
        unitOfMeasure: "Engagement",
        listPrice: "3200.00",
        currency: "EUR",
        status: "ACTIVE",
        createdById: admin.id,
        modifiedById: admin.id,
        createdAt: daysAgo(200),
      },
    }),
  );
  const activeProducts = products.filter((p) => p.status === "ACTIVE" && p.currency === "USD");
  await counter(org.id, "product", products.length);

  // Accounts
  const companies: [string, string, string, string, string, string][] = [
    ["Apex Manufacturing Co.", "apexmfg.example", "Manufacturing", "US", "Ohio", "Columbus"],
    ["BlueRiver Utilities", "blueriver.example", "Energy", "US", "Texas", "Houston"],
    ["Cobalt Engineering Ltd", "cobalteng.example", "Construction", "GB", "England", "Manchester"],
    ["Delta Agro Processing", "deltaagro.example", "Food & Beverage", "IN", "Maharashtra", "Pune"],
    ["Evergreen Hospitals", "evergreenhc.example", "Healthcare", "US", "California", "San Diego"],
    ["Falcon Logistics", "falconlog.example", "Logistics", "AE", "Dubai", "Dubai"],
    ["Granite Construction Group", "granitecg.example", "Construction", "US", "Colorado", "Denver"],
    ["Horizon Pharma Labs", "horizonpharma.example", "Pharmaceuticals", "IN", "Telangana", "Hyderabad"],
    ["Ironclad Automotive", "ironclad.example", "Automotive", "DE", "Bavaria", "Munich"],
    ["Juniper Retail Holdings", "juniperretail.example", "Retail", "SG", "Singapore", "Singapore"],
    ["Keystone Water Works", "keystonewater.example", "Energy", "US", "Pennsylvania", "Pittsburgh"],
    ["Lumen Data Centers", "lumendc.example", "Information Technology", "US", "Virginia", "Ashburn"],
  ];
  const phoneBase: Record<string, string> = { US: "+14155551000", GB: "+442079461000", IN: "+919820012300", AE: "+97145551000", DE: "+4989123400", SG: "+6561231000" };
  const accounts = [];
  for (const [i, [name, domain, industry, country, state, city]] of companies.entries()) {
    const owner = reps[i % reps.length]!;
    const created = daysAgo(380 - i * 25);
    accounts.push(
      await prisma.account.create({
        data: {
          organizationId: org.id,
          number: `ACC-${pad(i + 1)}`,
          name,
          nameNormalized: normalizeCompanyName(name),
          email: `procurement@${domain}`,
          phone: phoneBase[country]!.slice(0, -2) + String(i + 10).padStart(2, "0"),
          website: `https://${domain}`,
          industry,
          addressLine: `${100 + i * 7} Industrial Avenue`,
          country,
          state,
          city,
          postalCode: String(10000 + i * 137),
          status: i < 9 ? "ACTIVE" : i === 9 ? "ON_HOLD" : "PROSPECT",
          description: "Demo account.",
          ownerId: owner.id,
          createdById: owner.id,
          modifiedById: owner.id,
          createdAt: created,
          updatedAt: created,
        },
      }),
    );
  }
  await counter(org.id, "account", accounts.length);

  // Contacts (2–3 per account)
  const firstNames = ["Olivia", "Arjun", "Sophie", "Marcus", "Fatima", "Kenji", "Isabel", "Rahul", "Grace", "Tomás", "Hannah", "Vikram", "Chloe", "Omar", "Elena", "Noah"];
  const lastNames = ["Bennett", "Kapoor", "Laurent", "Hughes", "Al-Sayed", "Tanaka", "García", "Sharma", "Whitfield", "Moreno", "Schmidt", "Rao", "Dubois", "Haddad", "Petrov", "Clarke"];
  const designations = ["Procurement Manager", "Plant Head", "Operations Director", "Maintenance Lead", "CFO", "Purchase Executive"];
  const contacts = [];
  let cIdx = 0;
  for (const account of accounts) {
    const n = int(2, 3);
    for (let j = 0; j < n; j++) {
      cIdx++;
      const fn = firstNames[cIdx % firstNames.length]!;
      const ln = lastNames[(cIdx * 3) % lastNames.length]!;
      const consent = rand() > 0.35;
      const sub = consent ? (rand() > 0.2 ? "SUBSCRIBED" : "UNSUBSCRIBED") : "NOT_SUBSCRIBED";
      contacts.push(
        await prisma.contact.create({
          data: {
            organizationId: org.id,
            number: `CON-${pad(cIdx)}`,
            firstName: fn,
            lastName: ln,
            email: `${fn}.${ln}`.toLowerCase().normalize("NFKD").replace(/[^a-z.]/g, "") + `@${account.website!.replace("https://", "")}`,
            phone: account.phone!.slice(0, -2) + String(10 + j * 11 + (cIdx % 7)),
            designation: designations[cIdx % designations.length],
            department: j === 0 ? "Procurement" : pick(["Operations", "Engineering", "Finance", "Maintenance"]),
            accountId: account.id,
            ownerId: account.ownerId,
            preferredChannel: pick(["EMAIL", "PHONE", "WHATSAPP", "VIDEO_CALL"] as const),
            status: cIdx % 13 === 0 ? "LEFT_COMPANY" : "ACTIVE",
            source: "Demo import",
            marketingConsent: consent,
            consentAt: consent ? account.createdAt : null,
            consentSource: consent ? "Trade show sign-up form" : null,
            subscriptionStatus: sub,
            unsubscribedAt: sub === "UNSUBSCRIBED" ? daysAgo(30) : null,
            createdById: account.ownerId,
            modifiedById: account.ownerId,
            createdAt: account.createdAt,
          },
        }),
      );
    }
  }
  await counter(org.id, "contact", contacts.length);

  // Leads: ~60 spread over the last 12 months, weighted to recent months.
  const leadCompanies = [
    ...companies.map((c) => c[0]),
    "Mosaic Foods Pvt Ltd",
    "Northstar Mining",
    "Orion Textiles",
    "Pinnacle Packaging",
    "Quantum Chemicals",
    "Redwood Paper Mills",
    "Summit Steel Works",
    "Titan Marine Services",
  ];
  const leads = [];
  for (let i = 0; i < 62; i++) {
    const age = Math.floor(Math.pow(rand(), 1.6) * 360);
    const created = daysAgo(age, int(4, 12));
    const owner = reps[i % reps.length]!;
    const companyName = leadCompanies[i % leadCompanies.length]!;
    const account = accounts.find((a) => a.name === companyName);
    // Older leads are further along the funnel.
    const r = rand();
    let stageIdx = age > 120 ? (r < 0.45 ? 3 : r < 0.65 ? 2 : r < 0.85 ? 1 : 0) : age > 30 ? (r < 0.2 ? 3 : r < 0.45 ? 2 : r < 0.75 ? 1 : 0) : r < 0.1 ? 2 : r < 0.45 ? 1 : 0;
    if (!account && stageIdx === 3) stageIdx = 2;
    const stage = LEAD_STAGES[stageIdx]!;
    const name = `${firstNames[(i * 5) % firstNames.length]} ${lastNames[(i * 7) % lastNames.length]}`;
    const value = int(4, 120) * 500;
    const stageDates: { stage: LeadStage; at: Date }[] = [{ stage: "QUALIFIED", at: created }];
    let cursor = created.getTime();
    for (let s = 1; s <= stageIdx; s++) {
      cursor = Math.min(cursor + int(3, 25) * DAY, now.getTime() - DAY);
      stageDates.push({ stage: LEAD_STAGES[s]!, at: new Date(cursor) });
    }
    const convertedAt = stage === "CONVERTED" ? stageDates[stageDates.length - 1]!.at : null;
    const followUp = stage === "CONVERTED" ? null : utcDate(new Date(now.getTime() + int(-6, 21) * DAY));
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        number: `LD-${pad(i + 1)}`,
        name,
        email: `${name.split(" ")[0]!.toLowerCase()}.${i}@${companyName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14)}.example`,
        phone: `+1415555${String(2000 + i)}`,
        companyName,
        accountId: account && (stage === "CONVERTED" || rand() > 0.5) ? account.id : null,
        sourceId: sources[i % sources.length]!.id,
        ownerId: owner.id,
        stage,
        estimatedValue: value.toFixed(2),
        currency: "USD",
        description: `Interested in ${pick(activeProducts).name.toLowerCase()} for upcoming ${pick(["plant expansion", "maintenance cycle", "new facility", "replacement programme"])}. (Demo)`,
        nextFollowUpAt: followUp,
        convertedAt,
        convertedById: convertedAt ? owner.id : null,
        createdById: owner.id,
        modifiedById: owner.id,
        createdAt: created,
        updatedAt: stageDates[stageDates.length - 1]!.at,
        stageHistory: {
          create: stageDates.map((s, idx) => ({
            fromStage: idx === 0 ? null : stageDates[idx - 1]!.stage,
            toStage: s.stage,
            changedById: owner.id,
            changedAt: s.at,
            note: idx === 0 ? "Lead created" : s.stage === "CONVERTED" ? "Lead converted" : null,
          })),
        },
      },
    });
    leads.push(lead);
    if (stageIdx >= 1) {
      await prisma.leadDiscussion.create({
        data: {
          leadId: lead.id,
          discussedAt: utcDate(stageDates[1]!.at),
          summary: "Discussed technical requirements and indicative pricing. (Demo)",
          requirements: "Delivery within 6 weeks; on-site installation support.",
          objections: rand() > 0.5 ? "Price is above the incumbent supplier's quote." : null,
          nextSteps: "Share revised proposal and arrange site visit.",
          nextFollowUpAt: followUp,
          responsibleUserId: owner.id,
          createdById: owner.id,
          createdAt: stageDates[1]!.at,
        },
      });
    }
    if (convertedAt && account) {
      const buyer = contacts.find((c) => c.accountId === account.id);
      if (buyer) await prisma.leadContact.create({ data: { leadId: lead.id, contactId: buyer.id, isPrimary: true } });
    }
    await prisma.auditLog.create({
      data: { organizationId: org.id, actorId: owner.id, entityType: "Lead", entityId: lead.id, action: "created", summary: `Created lead ${lead.number} ${lead.name}`, createdAt: created },
    });
  }
  await counter(org.id, "lead", leads.length);

  // Meetings with minutes and action items
  let mIdx = 0;
  const openLeads = leads.filter((l) => l.stage !== "CONVERTED");
  for (const lead of [...openLeads.slice(0, 14), ...leads.filter((l) => l.stage === "CONVERTED").slice(0, 6)]) {
    mIdx++;
    const past = mIdx % 3 !== 0;
    const scheduledAt = past ? daysAgo(int(2, 60), int(4, 11)) : new Date(now.getTime() + int(1, 12) * DAY + int(1, 8) * 3600_000);
    const contactIds = lead.accountId ? contacts.filter((c) => c.accountId === lead.accountId).slice(0, 2).map((c) => c.id) : [];
    const meeting = await prisma.meeting.create({
      data: {
        organizationId: org.id,
        number: `MTG-${pad(mIdx)}`,
        title: `${pick(["Requirement discussion", "Product demo", "Commercial negotiation", "Site survey", "Quarterly review"])} — ${lead.companyName}`,
        scheduledAt,
        durationMins: pick([30, 45, 60, 90]),
        type: pick(["VIDEO_CALL", "IN_PERSON", "SITE_VISIT", "DEMO", "PHONE_CALL"] as const),
        status: past ? "COMPLETED" : "SCHEDULED",
        location: pick(["Customer office", "Microsoft Teams", "Google Meet", "Plant site"]),
        agenda: "Review requirements, pricing and delivery timelines. (Demo)",
        accountId: lead.accountId,
        leadId: lead.id,
        assignedToId: lead.ownerId,
        nextFollowUpAt: lead.nextFollowUpAt,
        createdById: lead.ownerId,
        modifiedById: lead.ownerId,
        createdAt: new Date(Math.min(scheduledAt.getTime(), now.getTime()) - 3 * DAY),
        contacts: { create: contactIds.map((contactId) => ({ contactId })) },
      },
    });
    if (past) {
      await prisma.meetingMinute.create({
        data: {
          meetingId: meeting.id,
          summary: "Customer confirmed interest; agreed to evaluate a pilot order. (Demo)",
          requirements: "Spares availability for 5 years; local service engineer.",
          decisions: "Proceed with pilot quantity pending budget approval.",
          authorId: lead.ownerId,
          createdAt: new Date(scheduledAt.getTime() + 2 * 3600_000),
        },
      });
      const items = [
        { d: "Send revised commercial proposal", due: int(-8, 6), st: rand() > 0.5 ? "DONE" : "OPEN" },
        { d: "Share product datasheets and certifications", due: int(-3, 10), st: rand() > 0.6 ? "DONE" : "IN_PROGRESS" },
      ] as const;
      for (const it of items) {
        await prisma.actionItem.create({
          data: {
            meetingId: meeting.id,
            description: it.d,
            ownerId: lead.ownerId,
            dueDate: utcDate(new Date(now.getTime() + it.due * DAY)),
            status: it.st,
            completedAt: it.st === "DONE" ? daysAgo(1) : null,
          },
        });
      }
    }
  }
  await counter(org.id, "meeting", mIdx);

  // Orders
  const flow: OrderStatus[] = ["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const convertedLeads = leads.filter((l) => l.stage === "CONVERTED" && l.accountId);
  let oIdx = 0;
  for (let i = 0; i < 34; i++) {
    const account = accounts[i % 9]!;
    const lead = convertedLeads.find((l) => l.accountId === account.id && rand() > 0.3) ?? null;
    const age = Math.floor(Math.pow(rand(), 1.4) * 340);
    const orderDate = utcDate(daysAgo(age));
    const finalIdx = age > 60 ? 4 : age > 30 ? int(2, 4) : age > 10 ? int(1, 3) : int(0, 2);
    const cancelled = i % 11 === 5;
    const nLines = int(1, 4);
    const chosen = [...activeProducts].sort(() => rand() - 0.5).slice(0, nLines);
    const lines = chosen.map((p, idx) => {
      const quantity = String(int(1, 20));
      const discountPercent = rand() > 0.7 ? String(pick([5, 7.5, 10])) : "0";
      const taxRatePercent = p.taxRateId === gst18.id ? "18" : p.taxRateId === tax5.id ? "5" : "0";
      const t = computeLine({ quantity, unitPrice: p.listPrice.toString(), discountPercent, taxRatePercent });
      return {
        productId: p.id,
        position: idx + 1,
        productName: p.name,
        productSku: p.sku,
        description: p.shortDescription,
        unitOfMeasure: p.unitOfMeasure,
        quantity,
        unitPrice: p.listPrice.toFixed(2),
        listPriceAtSale: p.listPrice.toFixed(2),
        discountPercent,
        taxRatePercent,
        taxRateName: taxRatePercent === "18" ? "Standard 18%" : taxRatePercent === "5" ? "Reduced 5%" : null,
        lineSubtotal: t.lineSubtotal.toFixed(2),
        discountAmount: t.discountAmount.toFixed(2),
        taxAmount: t.taxAmount.toFixed(2),
        lineTotal: t.lineTotal.toFixed(2),
      };
    });
    const totals = computeOrder(lines);
    const status: OrderStatus = cancelled ? "CANCELLED" : flow[finalIdx]!;
    const owner = reps.find((r) => r.id === account.ownerId) ?? rep1;
    const created = new Date(orderDate.getTime() + 9 * 3600_000);
    const history: { from: OrderStatus | null; to: OrderStatus; at: Date }[] = [{ from: null, to: "DRAFT", at: created }];
    let t = created.getTime();
    const upto = cancelled ? 1 : finalIdx;
    for (let s = 1; s <= upto; s++) {
      t = Math.min(t + int(1, 6) * DAY, now.getTime() - 3600_000);
      history.push({ from: flow[s - 1]!, to: flow[s]!, at: new Date(t) });
    }
    if (cancelled) history.push({ from: "CONFIRMED", to: "CANCELLED", at: new Date(Math.min(t + 2 * DAY, now.getTime() - 3600_000)) });
    const shippedAt = history.find((h) => h.to === "SHIPPED")?.at;
    const deliveredAt = history.find((h) => h.to === "DELIVERED")?.at;
    const deliveryStatus: DeliveryStatus = cancelled ? "CANCELLED" : deliveredAt ? "DELIVERED" : shippedAt ? (rand() > 0.6 ? "OUT_FOR_DELIVERY" : "IN_TRANSIT") : "NOT_SHIPPED";
    oIdx++;
    const address = `${account.addressLine}, ${account.city}, ${account.state} ${account.postalCode}, ${account.country}`;
    const order = await prisma.order.create({
      data: {
        organizationId: org.id,
        number: `ORD-${pad(oIdx)}`,
        accountId: account.id,
        leadId: lead?.id ?? null,
        ownerId: owner.id,
        orderDate,
        expectedDeliveryDate: utcDate(new Date(orderDate.getTime() + int(10, 30) * DAY)),
        actualDeliveryDate: deliveredAt ? utcDate(deliveredAt) : null,
        billingAddress: address,
        shippingAddress: address,
        currency: "USD",
        subtotal: totals.subtotal.toFixed(2),
        discountTotal: totals.discountTotal.toFixed(2),
        taxTotal: totals.taxTotal.toFixed(2),
        total: totals.total.toFixed(2),
        status,
        deliveryStatus,
        carrier: shippedAt ? pick(["BlueDart", "DHL Express", "FedEx Freight", "Maersk"]) : null,
        trackingNumber: shippedAt ? `TRK${int(10000000, 99999999)}` : null,
        notes: "Demo order.",
        createdById: owner.id,
        modifiedById: owner.id,
        createdAt: created,
        updatedAt: history[history.length - 1]!.at,
        lineItems: { create: lines },
        statusHistory: {
          create: history.map((h) => ({ fromStatus: h.from, toStatus: h.to, changedAt: h.at, changedById: owner.id, note: h.from === null ? "Order created" : null })),
        },
      },
    });
    const events: Prisma.DeliveryEventCreateManyInput[] = [];
    if (shippedAt) events.push({ orderId: order.id, status: "IN_TRANSIT", occurredAt: shippedAt, location: "Origin warehouse", carrier: order.carrier, trackingNumber: order.trackingNumber, recordedById: owner.id, note: "Shipment dispatched" });
    if (shippedAt && deliveryStatus === "OUT_FOR_DELIVERY") events.push({ orderId: order.id, status: "OUT_FOR_DELIVERY", occurredAt: new Date(Math.min(shippedAt.getTime() + 2 * DAY, now.getTime() - 3600_000)), location: account.city, carrier: order.carrier, trackingNumber: order.trackingNumber, recordedById: owner.id });
    if (deliveredAt) events.push({ orderId: order.id, status: "DELIVERED", occurredAt: deliveredAt, location: account.city, carrier: order.carrier, trackingNumber: order.trackingNumber, recordedById: owner.id, note: "Signed by receiving clerk" });
    if (events.length) await prisma.deliveryEvent.createMany({ data: events });
  }
  // One EUR order to demonstrate multi-currency handling in reports.
  {
    const eur = products.find((p) => p.currency === "EUR")!;
    const t = computeLine({ quantity: "1", unitPrice: eur.listPrice.toString() });
    oIdx++;
    await prisma.order.create({
      data: {
        organizationId: org.id,
        number: `ORD-${pad(oIdx)}`,
        accountId: accounts[8]!.id,
        ownerId: manager.id,
        orderDate: utcDate(daysAgo(12)),
        billingAddress: "Ironclad Automotive, Munich, DE",
        shippingAddress: "Ironclad Automotive, Munich, DE",
        currency: "EUR",
        subtotal: t.lineSubtotal.toFixed(2),
        total: t.lineTotal.toFixed(2),
        status: "CONFIRMED",
        createdById: manager.id,
        modifiedById: manager.id,
        lineItems: {
          create: [{ productId: eur.id, position: 1, productName: eur.name, productSku: eur.sku, unitOfMeasure: eur.unitOfMeasure, quantity: "1", unitPrice: eur.listPrice.toFixed(2), listPriceAtSale: eur.listPrice.toFixed(2), lineSubtotal: t.lineSubtotal.toFixed(2), discountAmount: "0", taxAmount: "0", lineTotal: t.lineTotal.toFixed(2) }],
        },
        statusHistory: { create: [{ toStatus: "DRAFT", changedById: manager.id, changedAt: daysAgo(12), note: "Order created" }, { fromStatus: "DRAFT", toStatus: "CONFIRMED", changedById: manager.id, changedAt: daysAgo(11) }] },
      },
    });
  }
  await counter(org.id, "order", oIdx);

  // Tickets
  const orders = await prisma.order.findMany({ where: { organizationId: org.id }, orderBy: { number: "asc" } });
  const ticketDefs = [
    ["Pump vibration after installation", "TECHNICAL", "HIGH"],
    ["Invoice copy requested", "BILLING", "LOW"],
    ["Shipment delayed beyond expected date", "DELIVERY_ISSUE", "URGENT"],
    ["Wrong valve size delivered", "ORDER_ISSUE", "HIGH"],
    ["Request for spare parts catalogue", "PRODUCT_QUESTION", "MEDIUM"],
    ["Complaint about installation crew conduct", "COMPLAINT", "MEDIUM"],
    ["Warranty claim for impeller", "TECHNICAL", "MEDIUM"],
    ["Update delivery address", "ORDER_ISSUE", "LOW"],
    ["Safety harness certification query", "PRODUCT_QUESTION", "LOW"],
    ["Damaged packaging on arrival", "DELIVERY_ISSUE", "HIGH"],
    ["General pricing inquiry", "GENERAL_INQUIRY", "LOW"],
    ["Missing items in shipment", "ORDER_ISSUE", "URGENT"],
  ] as const;
  const tStatuses = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"] as const;
  for (const [i, [subject, category, priority]] of ticketDefs.entries()) {
    const order = orders[i * 2]!;
    const contact = contacts.find((c) => c.accountId === order.accountId);
    const status = tStatuses[i % tStatuses.length]!;
    const created = daysAgo(int(1, 90));
    const resolved = status === "RESOLVED" || status === "CLOSED" ? new Date(created.getTime() + int(1, 5) * DAY) : null;
    const agent = i % 4 === 3 ? null : i % 2 ? support2 : support;
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: org.id,
        number: `TKT-${pad(i + 1)}`,
        subject,
        description: `${subject}. Customer reported via phone. (Demo)`,
        category,
        priority,
        status,
        accountId: order.accountId,
        contactId: contact?.id ?? null,
        orderId: order.id,
        leadId: order.leadId,
        assignedToId: agent?.id ?? null,
        resolutionNote: resolved ? "Issue resolved after site inspection and part replacement." : null,
        resolvedAt: resolved,
        closedAt: status === "CLOSED" ? resolved : null,
        createdById: pick([support.id, rep1.id, rep2.id]),
        createdAt: created,
        updatedAt: resolved ?? created,
      },
    });
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, kind: "INTERNAL_NOTE", body: "Checked order history and dispatch records. (Demo)", authorId: agent?.id ?? support.id, createdAt: new Date(created.getTime() + 3600_000) } });
    if (status !== "OPEN") {
      await prisma.ticketMessage.create({ data: { ticketId: ticket.id, kind: "CUSTOMER_REPLY", body: "Thank you for reporting this. Our team is looking into it and will update you shortly.", delivery: "RECORDED_ONLY", authorId: agent?.id ?? support.id, createdAt: new Date(created.getTime() + 2 * 3600_000) } });
    }
  }
  await counter(org.id, "ticket", ticketDefs.length);

  // Welcome notifications
  for (const u of [admin, manager, rep1, rep2, support]) {
    await prisma.notification.create({
      data: { organizationId: org.id, userId: u.id, type: "system", title: "Welcome to the demo workspace", body: "All records in this organization are fictional demo data.", link: "/" },
    });
  }

  // ─── Tenant 2: a separate organization, used to verify tenant isolation ───
  const t2 = await createOrg("Globex Trading (Demo Tenant 2)", "globex-demo", "EUR", "Europe/Berlin");
  await prisma.user.create({ data: { organizationId: t2.org.id, roleId: t2.roles.ADMIN!, name: "Greta Hansen", email: "admin@globex.demo", jobTitle: "Administrator", passwordHash } });
  const gSrc = await prisma.leadSource.create({ data: { organizationId: t2.org.id, name: "Manual Entry", isSystem: true } });
  const gAdmin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@globex.demo" } });
  await prisma.lead.create({
    data: {
      organizationId: t2.org.id,
      number: "LD-00001",
      name: "Confidential Globex Lead",
      email: "buyer@initech.example",
      phone: "+4930123456",
      companyName: "Initech GmbH",
      sourceId: gSrc.id,
      ownerId: gAdmin.id,
      estimatedValue: "25000.00",
      currency: "EUR",
      description: "Belongs to tenant 2 only. (Demo)",
      createdById: gAdmin.id,
      modifiedById: gAdmin.id,
      stageHistory: { create: { toStage: "QUALIFIED", changedById: gAdmin.id, note: "Lead created" } },
    },
  });
  await counter(t2.org.id, "lead", 1);

  console.log("\nDemo data ready. All demo users share the password:", DEMO_PASSWORD);
  console.table([
    { role: "Administrator", login: "admin@salesflow.demo (or username: admin)" },
    { role: "Sales Manager", login: "manager@salesflow.demo" },
    { role: "Sales Representative", login: "priya@salesflow.demo (team lead for Meera) / daniel@salesflow.demo / meera@salesflow.demo" },
    { role: "Support Agent", login: "support@salesflow.demo / lena@salesflow.demo" },
    { role: "Tenant 2 admin", login: "admin@globex.demo" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
