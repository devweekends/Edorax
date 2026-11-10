import {
  BookOpen,
  CircleHelp,
  Dumbbell,
  FlaskConical,
  Headphones,
  Home,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Puzzle,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'home' | 'courses' | 'mine' | 'progress' | 'leaderboard' | 'audiobooks' | 'labs' | 'questions' | 'settings';

type NavItem = { id?: Section; label: string; icon: LucideIcon; soon?: boolean };

const LEARN: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'audiobooks', label: 'Audiobooks', icon: Headphones },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { label: 'Practice', icon: Dumbbell, soon: true },
  { label: 'Puzzles', icon: Puzzle, soon: true },
  { label: 'On-call tutor', icon: Mic, soon: true },
];

const YOU: NavItem[] = [
  { id: 'mine', label: 'My learning', icon: BookOpen },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'questions', label: 'Your questions', icon: CircleHelp },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  collapsed,
  toggleSidebar,
  section,
  onNavigate,
  myCount,
}: {
  collapsed: boolean;
  toggleSidebar: () => void;
  section: Section;
  onNavigate: (section: Section) => void;
  myCount: number;
}) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-sidebar text-foreground transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[240px]'}`}
      aria-label="Main navigation"
    >
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <NavGroup title="Learn" collapsed={collapsed} items={LEARN} section={section} onNavigate={onNavigate} />
        <NavGroup
          title="You"
          collapsed={collapsed}
          items={YOU}
          section={section}
          onNavigate={onNavigate}
          badges={{ mine: myCount }}
        />
      </nav>

      <div className="border-t border-border p-4">
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <>
              <PanelLeftClose size={17} />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavGroup({
  title,
  collapsed,
  items,
  section,
  onNavigate,
  badges,
}: {
  title: string;
  collapsed: boolean;
  items: NavItem[];
  section: Section;
  onNavigate: (section: Section) => void;
  badges?: Partial<Record<Section, number>>;
}) {
  return (
    <div className="mb-6">
      {collapsed ? (
        <div className="mx-3 mb-3 border-t border-border" />
      ) : (
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label}>
            <NavButton item={item} active={item.id !== undefined && section === item.id} collapsed={collapsed} onNavigate={onNavigate} badge={item.id ? badges?.[item.id] : undefined} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onNavigate,
  badge,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: (section: Section) => void;
  badge?: number;
}) {
  const Icon = item.icon;
  const layout = `flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${collapsed ? 'justify-center' : 'gap-3 px-3'}`;

  if (item.soon || item.id === undefined) {
    return (
      <div
        aria-disabled="true"
        title={`${item.label} (coming soon)`}
        className={`${layout} cursor-default text-muted-foreground/70`}
      >
        <Icon size={18} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Soon
            </span>
          </>
        )}
      </div>
    );
  }

  const id = item.id;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title={item.label}
      onClick={() => onNavigate(id)}
      className={`${layout} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      <Icon size={18} />
      {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
      {!collapsed && badge ? (
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{badge}</span>
      ) : null}
    </button>
  );
}
