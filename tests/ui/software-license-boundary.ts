import {Hono} from 'hono';
import {installSoftwareLicenseFixture} from '../services/software-license-fixture';
import type {AppEnv} from '../../src/platform/types';
// Only provider protocols are replaced. Every application request uses the built product.
const control=new Hono<AppEnv>();
installSoftwareLicenseFixture(control);
export function bind(_env:unknown) {}
export async function fixtureRequest(request:Request,env:AppEnv['Bindings']) {
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/__fixture/'))return null;
 if(!['/__fixture/init','/__fixture/software-control'].includes(path))return new Response('Unknown fixture endpoint',{status:404});
 return control.fetch(new Request('https://fixture.example.test/fixture/software-license',{method:'POST',headers:{'Content-Type':'application/json'},body:path.endsWith('/init')?'{}':await request.text()}),env);
}
