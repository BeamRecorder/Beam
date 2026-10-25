import type { InjectionKey } from 'vue';
import type { ClipTrackPropertyScope } from './clip-track-property-types';

export const clipTrackPropertyScopeKey: InjectionKey<ClipTrackPropertyScope> = Symbol('clip-track-property-scope');
