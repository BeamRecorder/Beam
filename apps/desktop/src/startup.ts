import './components/brand/startup/startup.css';
import { startRecorder } from './recorder-startup';
import { loadRecorderWindow } from './recorder-window-loader';

void startRecorder(() => loadRecorderWindow(location.search));
