import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
export async function writeFixture(repo){
await writeFile(join(repo,'availability.mjs'),`// Return unoccupied duration inside [start,end). Leases are half-open intervals.
export function availableDuration(start,end,leases) {
 if (!Number.isFinite(start)||!Number.isFinite(end)||end<start) throw new RangeError('window');
 const occupied=leases.reduce((n,[a,b])=>n+Math.max(0,Math.min(end,b)-Math.max(start,a)),0);
 return Math.max(0,end-start-occupied);
}
`)
await writeFile(join(repo,'reproduce.mjs'),`import assert from 'node:assert/strict';import {availableDuration as f} from './availability.mjs';assert.equal(f(0,20,[[2,9],[6,12]]),10);console.log('reproducer passed');`)
await writeFile(join(repo,'independent.mjs'),`import assert from 'node:assert/strict';import {availableDuration as f} from './availability.mjs';
let checked=0;
for(let seed=1;seed<=120;seed++){let x=seed;const random=()=>{x=(x*1664525+1013904223)>>>0;return x};const leases=Array.from({length:random()%12},()=>{const a=(random()%40)-10;return [a,a+random()%15]});const copy=JSON.stringify(leases);const expected=Array.from({length:20},(_,i)=>i+0.5).filter(t=>!leases.some(([a,b])=>a<=t&&t<b)).length;assert.equal(f(0,20,leases),expected);assert.equal(JSON.stringify(leases),copy);assert.equal(f(0,20,[...leases].reverse()),expected);checked++;}
assert.equal(f(0,20,[]),20);assert.equal(f(0,20,[[2,4],[4,6]]),16);assert.equal(f(0,20,[[2,4],[2,4]]),18);assert.equal(f(0,20,[[-5,25]]),0);assert.equal(f(0,0,[]),0);assert.equal(f(0,2,[[0.25,0.75],[0.5,1.25]]),1);assert.throws(()=>f(2,1,[]),RangeError);assert.throws(()=>f(NaN,1,[]),RangeError);console.log('PASS independent '+checked+' generated cases and boundary cases');`)
}
