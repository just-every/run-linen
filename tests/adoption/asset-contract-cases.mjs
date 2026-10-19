import assert from 'node:assert/strict';
export async function attachArchiveContracts(ok,auth) {
  const records=await ok('/fixtures/records','GET',undefined,auth),device=records.assets[0],work=records.work[0];
  const vendor=await ok('/suppliers','POST',{name:'AppleCare archive vendor',services:[records.services[0].id],contract:'AppleCare PO-1042',currency:'USD',cost:249,costPeriod:'annual',renewalAt:'2030-01-01T00:00:00Z'},auth,201);
  await ok(`/assets/${device.id}/contracts`,'POST',{kind:'warranty',name:'AppleCare archive coverage',vendorId:vendor.id,reference:'https://records.example.test/applecare.pdf',coverage:'Hardware repairs',startsAt:'2026-01-01',expiresAt:'2030-01-01',manufacturer:'apple'},auth,201);
  await ok(`/work/${work.id}/repair-assets`,'POST',{assetId:device.id},auth);
}
export async function checkArchiveContracts(ok,auth) {
  const records=await ok('/fixtures/records','GET',undefined,auth),device=records.assets[0],work=records.work[0];
  const contracts=await ok(`/assets/${device.id}/contracts`,'GET',undefined,auth);
  assert.equal(contracts.items.length,1,'ASSET-007 contract survives native restore');
  assert.equal(contracts.items[0].name,'AppleCare archive coverage');
  assert.equal(contracts.items[0].vendor.name,'AppleCare archive vendor');
  const repairs=await ok(`/work/${work.id}/repair-assets`,'GET',undefined,auth);
  assert.equal(repairs.items[0].items[0].id,contracts.items[0].id,'ASSET-007 repair and vendor relationships remap together');
  console.log('PASS ASSET-007 native archive restores contract, vendor, asset and repair relationships under the existing execution hold');
}
