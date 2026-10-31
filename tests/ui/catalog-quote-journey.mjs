import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

const quotePdf = Buffer.from('%PDF-1.7\n% synthetic-linen-quote-body-marker\n%%EOF\n');

/**
 * CATALOG-001 on native screens: the owner adds a software item, requires a vendor quote, edits its questions and
 * audience; an eligible employee is refused without the quote, then submits it; the approver reads it in the approval
 * view; another employee gets a 404. Evidence is captured at 1440.
 */
export async function catalogQuoteJourney({browser,page,api,base,out}) {
  const {apiFor,signIn}=await import('./connected-helpers.mjs');
  const password='synthetic-Connected-browser-2026', suffix=crypto.randomUUID().slice(0,8);
  const owner=await api('/session');
  const emails=new Map();
  const member=async(name,role)=>{const email=`quote-${name.toLowerCase().replace(/\W+/g,'-')}-${suffix}@example.test`;const m=await api('/members',{name,email,password,roles:[role],isPerson:true});emails.set(m.id,email);return m;};
  const [approver,employee,colleague]=[await member('Quote approver','approver'),await member('Quote employee','employee'),await member('Quote colleague','employee')];
  const emailOf=m=>emails.get(m.id);

  // Owner: a value, an item of the new software kind, its quote requirement and question, then its audience.
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true});
  const disclosure=title=>registry.locator('details').filter({has:page.locator('summary').getByText(title,{exact:true})}).last();
  await registry.getByText('Manage audience values',{exact:true}).click();
  const values=disclosure('Manage audience values');
  await values.getByText('Add a value',{exact:true}).click();
  const valueForm=values.locator('details[data-action-path="/catalog-values"] form');
  await valueForm.getByLabel('Value list').selectOption('department');
  await valueForm.getByLabel('Value name').fill('Quote Design '+suffix);
  const adding=page.waitForResponse(r=>r.url().endsWith('/catalog-values')&&r.request().method()==='POST');
  await valueForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await adding).status(),201,'CATALOG-001 the owner adds an audience value natively');
  const itemName='Software purchase '+suffix;
  await registry.getByText('Add catalog item',{exact:true}).click();
  const itemForm=disclosure('Add catalog item').locator('form');
  await itemForm.getByLabel('Item name').fill(itemName);
  await itemForm.getByLabel('Item kind').selectOption('software');
  await itemForm.getByLabel('Reviewed target or service name').fill('quote-software-'+suffix);
  await itemForm.getByLabel('Fulfilment owner').selectOption(owner.user.id);
  await itemForm.getByLabel('Require existing manager approval',{exact:true}).check();
  await captureJourney(page,{path:out+'/CATALOG-001-item-create.png',fullPage:true});
  const creating=page.waitForResponse(r=>r.url().endsWith('/catalog')&&r.request().method()==='POST');
  await itemForm.getByRole('button',{name:'Save catalog item',exact:true}).click();assert.equal((await creating).status(),201,'CATALOG-001 the owner creates an item natively');
  await registry.getByText('Manage catalog forms',{exact:true}).click();
  const formCard=disclosure('Manage catalog forms').locator('details').filter({has:page.locator('summary').getByText(itemName,{exact:true})}).last();
  await formCard.locator(':scope > summary').click();
  const editor=formCard.locator('form');
  await editor.getByLabel('Require a vendor quote (PDF)',{exact:true}).check();
  await editor.getByRole('button',{name:'Add question',exact:true}).click();
  await editor.getByLabel('Question label 1',{exact:true}).fill('Quoted price in USD');
  await editor.getByLabel('Answer type 1',{exact:true}).selectOption('number');
  await editor.getByLabel('Required question 1',{exact:true}).check();
  const saving=page.waitForResponse(r=>/\/catalog\/[^/]+\/form$/.test(r.url())&&r.request().method()==='POST');
  await editor.getByRole('button',{name:'Save catalog form',exact:true}).click();assert.equal((await saving).status(),200,'CATALOG-001 the owner requires a quote and a price question');
  const item=(await api('/catalog')).items.find(c=>c.name===itemName);
  assert.equal(item.form.quoteRequired,true);assert.equal(item.kind,'software');
  await registry.getByText('Manage catalog audiences',{exact:true}).click();
  const audienceCard=disclosure('Manage catalog audiences').locator('details').filter({has:page.locator('summary').getByText(itemName,{exact:true})}).last();
  await audienceCard.locator(':scope > summary').click();
  const audienceForm=audienceCard.getByRole('form',{name:'Item audience'});
  await audienceForm.getByLabel('Quote Design '+suffix,{exact:true}).check();
  await captureJourney(page,{path:out+'/CATALOG-001-audience-editor.png',fullPage:true});
  const audienceSaving=page.waitForResponse(r=>/\/catalog\/[^/]+\/audience$/.test(r.url())&&r.request().method()==='POST');
  await audienceForm.getByRole('button',{name:'Save audience',exact:true}).click();assert.equal((await audienceSaving).status(),200,'CATALOG-001 the owner edits the audience natively');
  const design=(await api('/catalog-values')).items.find(v=>v.label==='Quote Design '+suffix);
  const current=(await api('/catalog')).items.find(c=>c.id===item.id);
  assert.deepEqual(current.audience.department,[design.id]);

  // Reviewed facts: the employee is in the audience and reports to the approver; the colleague is in no audience.
  const person=(await api('/people')).items.find(p=>p.id===employee.personId);
  await api('/people',{source:person.source,sourceId:person.source_id,name:person.name,effectiveAt:new Date(Date.now()-1000).toISOString(),
    observedAt:new Date().toISOString(),expectedRevision:person.revision,managerId:approver.id,attributes:{department:design.id}});
  const sessions={};
  for(const [label,m] of [['employee',employee],['approver',approver],['colleague',colleague]]) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),ep=await context.newPage();
    await signIn(ep,base,emailOf(m),password);sessions[label]={context,page:ep,api:apiFor(ep)};
  }
  try {
    // Employee: refused without the quote and for a non-PDF, accepted with the PDF.
    const user=sessions.employee,ep=user.page;
    const work=await user.api('/work',{title:'Buy design software '+suffix,body:'Licences for the studio',deduplicationKey:crypto.randomUUID()});
    await ep.goto(base+'/app#/work/'+work.id);
    const chooser=ep.locator('details[data-action-path$="/fulfilment"]');
    await chooser.locator(':scope > summary').click();
    await chooser.getByLabel('Service',{exact:true}).selectOption(item.id);
    await chooser.getByLabel('Quoted price in USD',{exact:false}).fill('1800');
    await chooser.getByLabel(/What do you need it for/).fill('Design studio licences');
    const submit=()=>ep.waitForResponse(r=>r.url().endsWith('/work/'+work.id+'/fulfilment')&&r.request().method()==='POST');
    let sending=submit();await chooser.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal((await sending).status(),422,'CATALOG-001 a quote-required item refuses submission without the quote');
    await ep.getByText('Attach the vendor quote (PDF) to submit this request.',{exact:true}).waitFor();
    await captureJourney(ep,{path:out+'/CATALOG-001-quote-required.png',fullPage:true});
    const upload=ep.waitForResponse(r=>r.url().endsWith('/work/'+work.id+'/catalog-quote'));
    await chooser.getByLabel('Vendor quote (PDF)',{exact:false}).setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not a pdf')});
    await chooser.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal((await upload).status(),422,'CATALOG-001 a non-PDF quote is refused');
    await ep.getByText('Quotes must be PDF files up to 20 MiB.',{exact:true}).waitFor();
    await chooser.getByLabel('Vendor quote (PDF)',{exact:false}).setInputFiles({name:'synthetic-linen-quote.pdf',mimeType:'application/pdf',buffer:quotePdf});
    sending=submit();await chooser.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal((await sending).status(),201,'CATALOG-001 the PDF quote and answers submit natively');
    const submitted=ep.getByRole('region',{name:'Submitted catalog forms',exact:true});
    await submitted.getByRole('link',{name:/Download the quote/}).waitFor();
    await captureJourney(ep,{path:out+'/CATALOG-001-quote-submitted.png',fullPage:true});
    const quote=(await user.api(`/work/${work.id}/catalog-requests`)).items[0].catalogSnapshot.quote;
    assert.ok(quote.id&&quote.sha256,'CATALOG-001 the snapshot freezes the quote id and hash');
    const href='/api/v1/catalog-quotes/'+quote.id;
    const own=await ep.request.get(base+href);
    assert.equal(own.status(),200);assert.equal(Buffer.compare(await own.body(),quotePdf),0,'CATALOG-001 the requester downloads the exact PDF');
    assert.match(own.headers()['content-disposition'],/^attachment/,'CATALOG-001 a quote downloads, never displays inline');

    // Approver: the quote is in the approval view and downloadable; another employee has no sign of it.
    const ap=sessions.approver.page;
    await ap.goto(base+'/app#/decisions');
    await ap.getByRole('heading',{name:'Catalog approvals',exact:true}).waitFor();
    const card=ap.locator('article.decision').filter({has:ap.getByRole('heading',{name:'Buy design software '+suffix,exact:true})});
    await card.getByRole('link',{name:/Download the quote/}).waitFor();
    await captureJourney(ap,{path:out+'/CATALOG-001-quote-approver.png',fullPage:true});
    const approverRead=await ap.request.get(base+href);
    assert.equal(approverRead.status(),200,'CATALOG-001 the current approver reads the quote');
    const other=sessions.colleague.page;
    assert.equal((await other.request.get(base+href)).status(),404,'CATALOG-001 another employee gets a 404 for the quote');
    assert.equal((await other.request.get(base+'/api/v1/attachments/'+quote.id)).status(),404,'CATALOG-001 the generic attachment door never serves it');
    console.log('PASS CATALOG-001 native item creation, quote requirement, audience editor, quote refusal and upload, approver reading and colleague 404 at 1440');
  } finally {for(const s of Object.values(sessions))await s.context.close();}
}

// Developer-only focused entry point; the ordinary browser suite also runs this journey.
