import { expect, it } from 'vitest';
import { transitionPair } from './transitionModel';
import type { Project } from '../shared/editorTypes';

const project:Project={id:'project',name:'Transitions',canvas:{width:320,height:180,fps:30,background:0},assets:[],warnings:[],tracks:[],clips:[
  {id:'first',assetId:'a',trackId:'video',startMs:0,sourceInMs:500,durationMs:1000},
  {id:'second',assetId:'b',trackId:'video',startMs:1000,sourceInMs:500,durationMs:1000},
  {id:'gap',assetId:'c',trackId:'video',startMs:2500,sourceInMs:500,durationMs:1000},
  {id:'audio',assetId:'d',trackId:'audio',startMs:1000,sourceInMs:500,durationMs:1000},
]};
it('finds the adjacent second input and orders two selections by their cut',()=>{
  expect(transitionPair(project,['first'])).toEqual(['first','second']);
  expect(transitionPair(project,['second','first'])).toEqual(['first','second']);
  expect(transitionPair(project,['first','second'])).toEqual(['first','second']);
});
it('rejects missing inputs, gaps, different lanes and invalid selection sizes',()=>{
  expect(transitionPair(undefined,['first'])).toBeUndefined();
  for(const selected of [[],['missing'],['first','missing'],['gap'],['first','gap'],['first','audio'],['first','second','gap']]){
    expect(transitionPair(project,selected)).toBeUndefined();
  }
});
