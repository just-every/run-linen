import assert from 'node:assert/strict';
export const local = ms => new Date(Date.now() + ms).toISOString().slice(0,16);
export const later = ms => new Date(Date.now() + ms).toISOString();
export async function finishFirstRun(page, base) {
  await page.goto(base + '/setup');
  await page.getByRole('heading', {name:'Finish setup',exact:true}).waitFor();
  await page.getByLabel('I confirm this owner account is ready to use.').check();
  await page.getByRole('button', {name:'Finish setup',exact:true}).click();
  await page.getByRole('heading', {name:'Requests', exact: true}).waitFor();
}
export async function fields(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const item = form.locator(`[name="${name}"]`);
    if (Array.isArray(value) && await item.first().getAttribute('type') === 'checkbox') { for (const choice of value) await form.locator(`[name="${name}"][value="${choice}"]`).check(); continue; }
    if (await item.evaluate(e => e.tagName) === 'SELECT') await item.selectOption(String(value));
    else if (await item.getAttribute('type') === 'checkbox') await item.setChecked(Boolean(value));
    else await item.fill(typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}
export async function action(page, title, values, suffix, button = 'Save', expected = 200) {
  const form = page.locator(`details[data-action-path$="${suffix}"]`).filter({ has: page.locator('summary').getByText(title, { exact: true }) }).last();
  if (!await form.evaluate(e => e.open)) await form.locator(':scope > summary').click();
  await fields(form, values);
  const wait = page.waitForResponse(r => r.url().endsWith(suffix) && ['POST','PATCH','PUT'].includes(r.request().method()));
  await form.getByRole('button', { name: button, exact: true }).click();
  const response = await wait, data = await response.json();
  assert.equal(response.status(), expected, JSON.stringify({ suffix, data }));
  return data;
}
export const apiFor = page => async (path, body, method = body ? 'POST' : 'GET') => page.evaluate(async ({path,body,method}) => {
  const s = await (await fetch('/api/v1/session')).json();
  const r = await fetch('/api/v1'+path,{method,headers:{'Content-Type':'application/json','X-Linen-CSRF':s.csrfToken},body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw Error(path+' '+JSON.stringify(data));return data;
},{path,body,method});
export async function signIn(page, base, email, password='synthetic-Connected-browser-2026') {
  await page.goto(base + '/app');await page.getByLabel('Work email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Requests', exact: true}).waitFor();
}
export async function requestWork(page, base, message) {
  await page.goto(base+'/app#/work');await page.getByLabel('What would make work easier?').fill(message);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.waitForURL(/#\/work\/.+/);return page.url().split('/').at(-1);
}
export async function createConnection(page, api, base, provider, name, values) {
  await page.goto(base+'/app#/connections');await page.getByRole('button',{name:'Connect a service'}).click();
  const form=page.locator('form.inline-form').filter({has:page.getByRole('heading',{name:'What would you like to connect?'})});
  await form.locator('select').first().selectOption(provider);await form.getByLabel('Display name').fill(name);await fields(form,values);
  await form.getByRole('button',{name:'Save connection',exact:true}).click();
  const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name,exact:true})});await card.waitFor();
  const connection=(await api('/connections')).find(c=>c.name===name);assert.ok(connection);
  const test=page.waitForResponse(r=>r.url().endsWith('/connections/'+connection.id+'/test'));
  await card.getByRole('button',{name:'Check connection',exact:true}).click();assert.equal((await test).status(),200);
  const active=(await api('/connections')).find(c=>c.id===connection.id);assert.equal(active.status,'active');return active;
}
