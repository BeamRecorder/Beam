import { createPinia } from 'pinia';
import './style.css';
import { useThemeStore } from './stores/theme';
import { capture } from './api/capture';
const theme = useThemeStore(createPinia());
await theme.ready;
capture.notifyRegionMarkerReady();
