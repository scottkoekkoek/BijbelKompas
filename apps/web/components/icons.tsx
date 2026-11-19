// One icon set for the whole app: Lucide (ISC licence), with a consistent stroke.
// Every icon here is decorative (aria-hidden); the link or button around it carries the name.
import {
  Archive,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Compass,
  Download,
  Ellipsis,
  FileText,
  FolderOpen,
  GitCommitVertical,
  House,
  LayoutTemplate,
  LogOut,
  type LucideIcon,
  NotebookPen,
  PenLine,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

type Props = { size?: number };

function make(Icon: LucideIcon, defaultSize: number) {
  const Wrapped = ({ size = defaultSize }: Props) => <Icon size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
  Wrapped.displayName = `${Icon.displayName ?? "Lucide"}Icon`;
  return Wrapped;
}

export const CompassIcon = make(Compass, 28);
export const HomeIcon = make(House, 22);
export const BookIcon = make(BookOpen, 22);
export const NoteIcon = make(NotebookPen, 22);
export const TemplateIcon = make(LayoutTemplate, 22);
export const SearchIcon = make(Search, 22);
export const MoreIcon = make(Ellipsis, 22);
export const SettingsIcon = make(Settings, 22);
export const ChevronLeftIcon = make(ChevronLeft, 18);
export const ChevronRightIcon = make(ChevronRight, 18);
export const FolderIcon = make(FolderOpen, 22);
export const QuestionIcon = make(CircleHelp, 22);
export const TimelineIcon = make(GitCommitVertical, 22);
export const LogOutIcon = make(LogOut, 20);
export const SyncIcon = make(RefreshCw, 20);
export const PenIcon = make(PenLine, 20);
export const FileIcon = make(FileText, 20);
export const ArchiveIcon = make(Archive, 20);
export const ClockIcon = make(Clock, 20);
export const ArrowRightIcon = make(ArrowRight, 18);
export const DownloadIcon = make(Download, 20);
export const SparklesIcon = make(Sparkles, 20);

/** The app mark: a compass on the evergreen tile. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Compass size={20} strokeWidth={2} />
    </span>
  );
}
