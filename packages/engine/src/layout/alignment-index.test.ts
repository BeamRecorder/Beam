import { describe, expect, it } from 'vitest';
import { createAlignmentIndex } from './alignment-index';
const canvas = { width: 1920, height: 1004 };
describe('cached alignment anchors and document-pixel measures', () => {
  it.each([0, .5, 1])('snaps an edge or center to canvas anchor %s', (anchor) => {
    const query = createAlignmentIndex({ targets: [], canvas });
    const result = query({ x: anchor+.002, y:.233, width:.1, height:.1 }, { x:.004,y:.001 });
    expect(result.x).toBeCloseTo(anchor);
    expect(result.guides).toContainEqual({ type:'vertical',position:anchor });
  });
  it('uses the nearest anchor and independent screen-pixel tolerance for each axis', () => {
    const query = createAlignmentIndex({targets:[{x:.2,y:.2,width:.2,height:.2},{x:.209,y:.209,width:.2,height:.2}],canvas});
    const result=query({x:.208,y:.208,width:.1,height:.1},{x:.002,y:.0005});
    expect(result.x).toBeCloseTo(.209);expect(result.y).toBe(.208);
    expect(result.guides).toEqual([{type:'vertical',position:.209},{type:'vertical',position:.309}]);
  });
  it('measures dimensions and nearest non-overlapping neighbours in real document pixels', () => {
    const query=createAlignmentIndex({targets:[{x:.1,y:.3,width:.1,height:.2},{x:.7,y:.3,width:.1,height:.2},{x:.3,y:.1,width:.2,height:.1},{x:.3,y:.8,width:.2,height:.1}],canvas});
    const result=query({x:.3,y:.3,width:.2,height:.2},{x:0,y:0});
    expect(result.guides).toEqual([]);
    expect(result.measurements.find(m=>m.kind==='size'&&m.axis==='x')?.pixels).toBeCloseTo(384);
    const gaps=result.measurements.filter(m=>m.kind==='spacing');
    expect(gaps).toHaveLength(4);
    expect(gaps.map(m=>Math.round(m.pixels))).toEqual([192,384,100,301]);
  });
  it('ignores perpendicular neighbours and zero gaps',()=>{
    const query=createAlignmentIndex({targets:[{x:.3,y:.1,width:.1,height:.1},{x:.5,y:.4,width:.1,height:.1}],canvas});
    const r=query({x:.3,y:.4,width:.2,height:.1},{x:0,y:0});
    expect(r.measurements.filter(m=>m.kind==='spacing')).toHaveLength(1);
  });
  it('freezes anchors once and handles large, duplicate target sets without document mutation',()=>{
    const targets=Array.from({length:1000},(_,i)=>({x:i/1000,y:.25,width:.0001,height:.1}));
    const before=structuredClone(targets),query=createAlignmentIndex({targets,canvas});
    const r=query({x:.71201,y:.25,width:.1,height:.1},{x:.00005,y:.001});
    expect(r.x).toBeCloseTo(.712);expect(targets).toEqual(before);
    expect(new Set(r.guides.map(g=>`${g.type}:${g.position}`)).size).toBe(r.guides.length);
  });
});
