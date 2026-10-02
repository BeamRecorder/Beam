import { AppWindow, Code, FileText, Globe, MessagesSquare, Monitor, Palette, Play, Terminal } from '@lucide/vue';
import type { DevelopmentArtwork } from '~/api/types/source-picker';

const icons = {
  browser: Globe,
  code: Code,
  design: Palette,
  chat: MessagesSquare,
  terminal: Terminal,
  video: Play,
  document: FileText,
  desktop: Monitor,
};
export const developmentSourceIcon = (artwork?: DevelopmentArtwork) => (artwork ? icons[artwork] : AppWindow);
