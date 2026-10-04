/**
 * The app's icon layer. Every icon is a lucide component, never a unicode/emoji glyph. Import from
 * here, not `lucide-react-native`, for two reasons:
 *
 * 1. An RN SVG does not understand `className`, so each icon goes through NativeWind's
 *    `cssInterop` once, here.
 * 2. The package barrel is CJS, which Metro cannot tree-shake (importing it pulls in every icon,
 *    about 1.9MB). Each icon is deep-imported from lucide's `./icons/*` subpath export, which
 *    resolves via `unstable_enablePackageExports` in metro.config.js.
 *
 * Add an icon with one deep import plus an entry in `ICONS`. Colour comes from `className`, size
 * from lucide's `size` prop. This is lucide 1.x, whose names differ in places (`CircleCheckBig`,
 * `House`); check the package's `dist/esm/icons/` before adding one.
 */

import { cssInterop } from "nativewind";
import type { LucideIcon } from "lucide-react-native";

import Archive from "lucide-react-native/icons/archive";
import ArrowDownAZ from "lucide-react-native/icons/arrow-down-a-z";
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowUpDown from "lucide-react-native/icons/arrow-up-down";
import Bell from "lucide-react-native/icons/bell";
import Bug from "lucide-react-native/icons/bug";
import Calendar from "lucide-react-native/icons/calendar";
import CalendarClock from "lucide-react-native/icons/calendar-clock";
import CalendarDays from "lucide-react-native/icons/calendar-days";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Circle from "lucide-react-native/icons/circle";
import Coffee from "lucide-react-native/icons/coffee";
import Copy from "lucide-react-native/icons/copy";
import CopyPlus from "lucide-react-native/icons/copy-plus";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import CornerUpLeft from "lucide-react-native/icons/corner-up-left";
import Database from "lucide-react-native/icons/database";
import Download from "lucide-react-native/icons/download";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CircleCheckBig from "lucide-react-native/icons/circle-check-big";
import CircleX from "lucide-react-native/icons/circle-x";
import Clock from "lucide-react-native/icons/clock";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Expand from "lucide-react-native/icons/expand";
import FileText from "lucide-react-native/icons/file-text";
import Flag from "lucide-react-native/icons/flag";
import Flame from "lucide-react-native/icons/flame";
import Folder from "lucide-react-native/icons/folder";
import FolderInput from "lucide-react-native/icons/folder-input";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import Globe from "lucide-react-native/icons/globe";
import GripVertical from "lucide-react-native/icons/grip-vertical";
import Hash from "lucide-react-native/icons/hash";
import History from "lucide-react-native/icons/rotate-ccw-clock";
import House from "lucide-react-native/icons/house";
import Inbox from "lucide-react-native/icons/inbox";
import Info from "lucide-react-native/icons/info";
import Keyboard from "lucide-react-native/icons/keyboard";
import KeyRound from "lucide-react-native/icons/key-round";
import ListChecks from "lucide-react-native/icons/list-checks";
import ListFilter from "lucide-react-native/icons/list-filter";
import ListTodo from "lucide-react-native/icons/list-todo";
import LoaderCircle from "lucide-react-native/icons/loader-circle";
import Lock from "lucide-react-native/icons/lock";
import LogOut from "lucide-react-native/icons/log-out";
import MessageSquare from "lucide-react-native/icons/message-square";
import Menu from "lucide-react-native/icons/menu";
import Palette from "lucide-react-native/icons/palette";
import Minus from "lucide-react-native/icons/minus";
import PanelLeftClose from "lucide-react-native/icons/panel-left-close";
import PanelLeftOpen from "lucide-react-native/icons/panel-left-open";
import Paperclip from "lucide-react-native/icons/paperclip";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Repeat from "lucide-react-native/icons/repeat";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import Save from "lucide-react-native/icons/save";
import Send from "lucide-react-native/icons/send";
import Search from "lucide-react-native/icons/search";
import Server from "lucide-react-native/icons/server";
import Settings from "lucide-react-native/icons/settings";
import Smartphone from "lucide-react-native/icons/smartphone";
import SkipForward from "lucide-react-native/icons/skip-forward";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Sparkles from "lucide-react-native/icons/sparkles";
import SquareArrowOutUpRight from "lucide-react-native/icons/square-arrow-out-up-right";
import Square from "lucide-react-native/icons/square";
import Star from "lucide-react-native/icons/star";
import StarOff from "lucide-react-native/icons/star-off";
import Sun from "lucide-react-native/icons/sun";
import Tag from "lucide-react-native/icons/tag";
import Timer from "lucide-react-native/icons/timer";
import Trash2 from "lucide-react-native/icons/trash";
import Upload from "lucide-react-native/icons/upload";
import UserPlus from "lucide-react-native/icons/user-plus";
import UserRound from "lucide-react-native/icons/user-round";
import X from "lucide-react-native/icons/x";

/** Teach one lucide icon to read `className`: NativeWind resolves the classes to a style, then maps its `color`/`opacity` onto the SVG's props. */
function styled(icon: LucideIcon): void {
  cssInterop(icon, {
    className: {
      target: "style",
      nativeStyleToProp: { color: true, opacity: true },
    },
  });
}

/** The curated set, alphabetical. */
const ICONS = {
  Archive,
  ArrowDownAZ,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Bug,
  CircleAlert,
  CircleX,
  Coffee,
  Copy,
  CopyPlus,
  CornerDownRight,
  CornerUpLeft,
  Database,
  Download,
  CircleCheckBig,
  Clock,
  Ellipsis,
  EllipsisVertical,
  Expand,
  FileText,
  Flag,
  Flame,
  Folder,
  FolderInput,
  FolderPlus,
  Globe,
  GripVertical,
  Hash,
  History,
  House,
  Inbox,
  Info,
  Keyboard,
  KeyRound,
  ListChecks,
  ListFilter,
  ListTodo,
  LoaderCircle,
  Lock,
  LogOut,
  MessageSquare,
  Menu,
  Palette,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Repeat,
  RotateCcw,
  Save,
  Send,
  Search,
  Server,
  Settings,
  Smartphone,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Square,
  Star,
  StarOff,
  Sun,
  Tag,
  Timer,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  X,
} satisfies Record<string, LucideIcon>;

for (const icon of Object.values(ICONS)) styled(icon);

export type IconName = keyof typeof ICONS;
export type { LucideIcon };

export {
  Archive,
  ArrowDownAZ,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Bug,
  CircleAlert,
  CircleX,
  Coffee,
  Copy,
  CopyPlus,
  CornerDownRight,
  CornerUpLeft,
  Database,
  Download,
  CircleCheckBig,
  Clock,
  Ellipsis,
  EllipsisVertical,
  Expand,
  FileText,
  Flag,
  Flame,
  Folder,
  FolderInput,
  FolderPlus,
  Globe,
  GripVertical,
  Hash,
  History,
  House,
  Inbox,
  Info,
  Keyboard,
  KeyRound,
  ListChecks,
  ListFilter,
  ListTodo,
  LoaderCircle,
  Lock,
  LogOut,
  MessageSquare,
  Menu,
  Palette,
  Paperclip,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Repeat,
  RotateCcw,
  Save,
  Send,
  Search,
  Server,
  Settings,
  Smartphone,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Square,
  Star,
  StarOff,
  Sun,
  Tag,
  Timer,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  X,
};
