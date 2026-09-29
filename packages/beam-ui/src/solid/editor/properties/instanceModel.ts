import type { Binding, Instance, Parameter, Value } from '../shared/generated/editorContracts';

/** An inspector draft reads declared values without evaluating a second animation engine. */
export function bindingValue(binding: Binding | undefined, parameter: Parameter): Value {
  if (!binding) return parameter.default;
  return binding.kind === 'constant' ? binding.value : binding.keys.at(-1)?.value ?? parameter.default;
}
export function constantInstance(instance: Instance, key: string, value: Value): Instance {
  return { ...instance, parameters: { ...instance.parameters, [key]: { kind: 'constant', value } } };
}
export function numericValue(value: Value): number | undefined {
  return value.kind === 'number' ? value.value : undefined;
}
