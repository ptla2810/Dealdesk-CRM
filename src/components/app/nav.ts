import {
  BarChart3,
  Building2,
  CalendarClock,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Settings,
  Target,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: PermissionKey; anyOf?: PermissionKey[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/leads", label: "Leads", icon: Target, permission: "lead.view" },
  { href: "/accounts", label: "Accounts & Buyers", icon: Building2, permission: "account.view" },
  { href: "/contacts", label: "Contacts", icon: Users, permission: "contact.view" },
  { href: "/meetings", label: "Meetings & MOM", icon: CalendarClock, permission: "meeting.view" },
  { href: "/products", label: "Products", icon: Package, permission: "product.view" },
  { href: "/tickets", label: "Support Tickets", icon: LifeBuoy, permission: "ticket.view" },
  { href: "/orders", label: "Orders & Delivery", icon: Truck, permission: "order.view" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "report.view" },
  { href: "/settings", label: "Settings", icon: Settings },
];
