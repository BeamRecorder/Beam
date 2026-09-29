import type { Binding, Command, Edit, ExtensionPack, Interpolation, Operation, PresetTarget, Reference, ScopeAddress, ScopedAction, Time, TimeSpace, Value } from './generated/contracts.ts';

/** Results refer to earlier commands, so one atomic batch can insert and animate. */
export class Batch {
  readonly commands: Command[] = [];
  operation(operation: Operation, commandId = `command${this.commands.length + 1}`): Reference {
    if (!commandId || this.commands.some((command) => command.commandId === commandId)) throw new Error('Command IDs must be unique and nonempty');
    this.commands.push({ commandId, operation: structuredClone(operation) });
    return this.result(commandId);
  }
  result(commandId: string, index = 0): Reference {
    if (!this.commands.some((command) => command.commandId === commandId) || !Number.isSafeInteger(index) || index < 0) throw new Error('Created result requires an earlier command and a valid index');
    return index === 0 ? { createdBy: commandId } : { createdBy: commandId, index };
  }
  edit(edit: Edit, commandId?: string): Reference { return this.operation({ type: 'edit', edit }, commandId); }
  insert(assetId: string, track: Reference, startMs: number, durationMs: number, sourceInMs = 0, commandId?: string): Reference {
    return this.operation({ type: 'insert', assetId, track, startMs, sourceInMs, durationMs }, commandId);
  }
  effect(clip: Reference, definitionId: string, parameters: Record<string, Binding> = {}, definitionVersion = 1, commandId?: string): Reference {
    return this.operation({ type: 'effectAdd', clip, definitionId, definitionVersion, parameters }, commandId);
  }
  scoped(target: ScopeAddress, action: ScopedAction, commandId?: string): Reference {
    return this.operation({ type: 'scopedEffect', target, action }, commandId);
  }
  trackEffect(track: Reference, definitionId: string, parameters: Record<string, Binding> = {}, definitionVersion = 2, commandId?: string): Reference {
    return this.scoped({ kind: 'track', track }, { type: 'add', definitionId, definitionVersion, parameters }, commandId);
  }
  sequenceEffect(sequenceId: string, definitionId: string, parameters: Record<string, Binding> = {}, definitionVersion = 2, commandId?: string): Reference {
    return this.scoped({ kind: 'sequence', sequenceId }, { type: 'add', definitionId, definitionVersion, parameters }, commandId);
  }
  scopedParameter(target: ScopeAddress, instance: Reference, parameter: string, binding: Binding, commandId?: string): Reference {
    return this.scoped(target, { type: 'parameterSet', instance, parameter, binding }, commandId);
  }
  parameter(clip: Reference, instance: Reference, parameter: string, binding: Binding, commandId?: string): Reference {
    return this.operation({ type: 'parameterSet', clip, instance, parameter, binding }, commandId);
  }
  applyPreset(target: PresetTarget, presetId: string, presetVersion = 1, commandId?: string): Reference {
    return this.operation({ type: 'applyPreset', target, presetId, presetVersion }, commandId);
  }
  duplicateEffect(clip: Reference, instance: Reference, commandId?: string): Reference {
    return this.operation({ type: 'effectDuplicate', clip, instance }, commandId);
  }
  transition(fromClip: Reference, toClip: Reference, durationMs: number, definitionId = 'beam.crossfade', definitionVersion = 1, commandId?: string): Reference {
    return this.operation({ type: 'transitionAdd', fromClip, toClip, durationMs, definitionId, definitionVersion }, commandId);
  }
  generator(track: Reference, definitionId: string, startMs: number, durationMs: number, parameters: Record<string, Binding> = {}, definitionVersion = 1, commandId?: string): Reference {
    return this.operation({ type: 'generatorInsert', track, definitionId, definitionVersion, startMs, durationMs, parameters }, commandId);
  }
  keyframeAt(clip: Reference, instance: Reference, parameter: string, space: TimeSpace, sequenceTime: Time, value: Value, interpolation: Interpolation = { kind: 'linear' }, commandId?: string): Reference {
    return this.operation({ type: 'keyframeAt', clip, instance, parameter, space, sequenceTime, value, interpolation }, commandId);
  }
  register(pack: ExtensionPack, commandId?: string): Reference { return this.operation({ type: 'registerPack', pack }, commandId); }
  paste(clips: string[], sourceSequence: string, destinationTrack: Reference, startMs: number, commandId?: string): Reference {
    return this.operation({ type: 'copyPaste', clips, sourceSequence, destinationTrack, startMs }, commandId);
  }
  pasteMapped(clips: string[], sourceSequence: string, trackMap: Record<string, Reference>, startMs: number, commandId?: string): Reference {
    return this.operation({ type: 'pasteMapped', clips, sourceSequence, trackMap, startMs }, commandId);
  }
}
