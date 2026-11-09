import {
  BookOpen,
  Bookmark,
  Hash,
  LayoutDashboard,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; phase?: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trending", label: "Trending Posts", icon: TrendingUp },
  { href: "/influencers", label: "Influencers", icon: Users },
  { href: "/following", label: "My Following", icon: UserCheck },
  { href: "/topics", label: "My Topics", icon: Hash },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/saved", label: "Saved Posts", icon: Bookmark },
  { href: "/settings", label: "Settings", icon: Settings },
];
