import assert from 'node:assert/strict';
export default async function initialize({request,origin,token,displayName}) {
 const bootstrap=await request(origin+'/auth/bootstrap',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,displayName,returnTo:'/setup'}).toString()});
 assert.equal(bootstrap.status,303,'Native owner bootstrap');
 const cookie=bootstrap.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const complete=await request(origin+'/setup',{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/x-www-form-urlencoded'},body:'confirm=yes'});
 assert.equal(complete.status,303,'Native first-run confirmation');
 return bootstrap;
}
