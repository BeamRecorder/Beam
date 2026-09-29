import { expect, it } from 'vitest';
import { bindingValue, constantInstance, numericValue } from './instanceModel';
import type { Instance, Parameter } from '../shared/generated/editorContracts';
const parameter:Parameter={key:'opacity',label:'Opacity',group:'Video',unit:'',animatable:true,valueType:{kind:'number',min:0,max:1,step:0.01},default:{kind:'number',value:1}};
const instance:Instance={id:'fx',definitionId:'beam.opacity',definitionVersion:1,enabled:true,parameters:{}};
it('reads declared defaults and constants',()=>{
  expect(bindingValue(undefined,parameter)).toEqual(parameter.default);
  expect(bindingValue({kind:'constant',value:{kind:'number',value:0.4}},parameter)).toEqual({kind:'number',value:0.4});
});
it('uses the last stored key for an inspector draft without evaluating animation',()=>{
  expect(bindingValue({kind:'curve',space:'clipLocal',keys:[{id:'key',time:{ticks:1,timescale:1},interpolation:{kind:'linear'},value:{kind:'number',value:0.7}}]},parameter)).toEqual({kind:'number',value:0.7});
  expect(bindingValue({kind:'curve',space:'source',keys:[]},parameter)).toEqual(parameter.default);
});
it('replaces only the explicitly edited binding while retaining identity',()=>{
  const next=constantInstance(instance,'opacity',{kind:'number',value:0.2});
  expect(next.id).toBe(instance.id);expect(next.parameters.opacity).toEqual({kind:'constant',value:{kind:'number',value:0.2}});expect(instance.parameters).toEqual({});
});
it('reads numeric values without coercing discrete values',()=>{expect(numericValue({kind:'number',value:0})).toBe(0);expect(numericValue({kind:'boolean',value:false})).toBeUndefined();});
