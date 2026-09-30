import './startup.css';
import { startRecorder } from './recorder-startup';

void startRecorder(() => import('./main'));
