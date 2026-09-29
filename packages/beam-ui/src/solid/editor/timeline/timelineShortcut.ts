import type { NativeEventPayload } from '@argui/host';
import type { TimelineShortcut } from '../shared/editorStateTypes';

/** These shortcuts belong to the timeline canvas focus scope, which contains no text inputs. */
export function timelineShortcut(event:NativeEventPayload<'key'>,busy:boolean):TimelineShortcut|undefined {
  if(event.state!=='pressed' || event.repeat || busy || event.alt)return;
  if(event.control || event.super) {
    switch(event.key.toLowerCase()) {
      case 'z':return event.shift ? 'redo' : 'undo';
      case 'a':return 'selectAll';
      case 'c':return 'copy';
      case 'v':return 'paste';
      default:return;
    }
  }
  if(event.key==='Space' || event.key===' ')return 'play';
  if(event.key==='Delete')return 'remove';
  if(event.key==='Escape')return 'cancel';
}
