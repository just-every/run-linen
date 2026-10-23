import { useState, type FormEvent } from 'react';
import { useMutation, useRemote } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Facts, Hero, Notice } from './primitives';
import type { RecordValue } from './api';
const usd = (cents: unknown) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents)/100);
export function BillingSettings() {
  const plan = useRemote<RecordValue | null>('/billing/plan'), budget = useRemote<RecordValue | null>('/intelligence/budget'), mutation=useMutation();
  const [invoice,setInvoice]=useState<RecordValue|null>(null);
  async function preview(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f=new FormData(event.currentTarget);
    const next=await mutation.mutate<RecordValue>('/billing/invoice-preview',{
      address:{street:f.get('street'),city:f.get('city'),state:f.get('state'),postalCode:f.get('postalCode'),country:'US'},
      tax:{applicable:f.get('applicable')==='on',rateBps:Math.round(Number(f.get('rate'))*100),taxableBps:Math.round(Number(f.get('taxable'))*100),jurisdiction:f.get('jurisdiction'),basis:f.get('basis')},
    });if(next)setInvoice(next);
  }
  return <>
    <Hero eyebrow="Workspace costs" title="Pricing & budgets"><p className="lead">Review agent seats, your monthly reasoning limit and an invoice estimate in USD.</p></Hero>
    <Notice>Agent seats include active owners, operators and HR agents. Requester-only and approver-only members are free. Prices and tax determinations come from your agreement; this preview does not take payment.</Notice>
    <ErrorNotice error={plan.error||budget.error}/>
    <div className="split">
      <section>
        <ActionForm title="Agent seat pricing" path="/billing/plan" method="PUT" defaults={{revision:plan.data?.revision??0}}
          fields={[{name:'name',label:'Plan name',required:true,value:String(plan.data?.plan_name??'')},{name:'agentSeatCents',label:'Monthly price per agent · USD cents',type:'number',required:true,value:Number(plan.data?.agent_seat_cents??0)}]}
          submit="Save seat pricing" onSaved={()=>{plan.refresh();setInvoice(null)}}/>
        <ActionForm title="Monthly reasoning budget" path="/intelligence/budget" method="PUT" fields={[{name:'limitUsd',label:'Monthly limit · USD',type:'number',required:true,value:Number(budget.data?.limit_usd??0)}]}
          explanation="Calendar months in UTC. Unknown provider charges stay reserved across month boundaries. An exhausted budget holds model research while ordinary ticket work continues."
          submit="Save monthly budget" onSaved={budget.refresh}/>
        {budget.data&&<Facts entries={[["Current month",String(budget.data.period_start??'').slice(0,7)],["Configured limit",usd(Number(budget.data.limit_usd)*100)],["Estimated spend",usd(Number(budget.data.spent_usd)*100)],["Reserved uncertain charges",usd(Number(budget.data.reserved_usd)*100)]]}/>}
      </section>
      <section aria-label="Invoice preview">
        <h2>Invoice preview</h2>
        <form onSubmit={preview} className="action-form">
          <label><span>Street address</span><input name="street" required autoComplete="street-address"/></label>
          <label><span>City</span><input name="city" required autoComplete="address-level2"/></label>
          <label><span>State · two-letter code</span><input name="state" required maxLength={2} pattern="[A-Z]{2}" autoComplete="address-level1"/></label>
          <label><span>ZIP code</span><input name="postalCode" required pattern="[0-9]{5}(-[0-9]{4})?" autoComplete="postal-code"/></label>
          <label className="checkbox-field"><input type="checkbox" name="applicable"/><span>Sales tax applies</span></label>
          <label><span>Combined sales tax rate · percent</span><input name="rate" type="number" min="0" max="100" step="0.01" required/></label>
          <label><span>Taxable portion · percent</span><input name="taxable" type="number" min="0" max="100" step="0.01" required/></label>
          <label><span>Tax jurisdiction</span><input name="jurisdiction" required/></label>
          <label><span>Tax determination and source</span><textarea name="basis" required/></label>
          <p className="fact-note">Enter the rate and taxable portion applicable to this address. For Texas data processing, consult the <a href="https://comptroller.texas.gov/taxes/publications/94-127.php" target="_blank" rel="noreferrer">Texas Comptroller’s guidance</a> and applicable local rate.</p>
          <button className="action primary" disabled={mutation.pending||!plan.data}>Preview invoice</button>
        </form>
        <ErrorNotice error={mutation.error}/>
        {invoice&&<section aria-label="Invoice estimate" className="history"><h3>{String(invoice.plan)} · {String(invoice.period)}</h3><Facts entries={[["Agent seats",invoice.seats],["Monthly price per agent",usd(invoice.agentSeatCents)],["Free requesters and approvers",invoice.freeMembers],["Seat subtotal",usd(invoice.subtotalCents)],["Taxable amount",usd(invoice.taxableCents)],["Sales tax",usd(invoice.taxCents)],["Total · USD",usd(invoice.totalCents)]]}/><p>{String(invoice.note)}</p></section>}
      </section>
    </div>
  </>;
}
