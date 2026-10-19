import { useState } from 'react';
import { useRemote } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Facts, Loading } from './primitives';
import type { financialReport } from '../features/work/depreciation';

type Report=ReturnType<typeof financialReport>;
const usd=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function AssetFinancials({assetId}:{assetId:string}) {
  const [asOf,setAsOf]=useState(new Date().toISOString().slice(0,10));
  const [fiscalStart,setFiscalStart]=useState(`${new Date().getUTCFullYear()}-01-01`);
  const query=`?asOf=${encodeURIComponent(asOf)}&fiscalStart=${encodeURIComponent(fiscalStart)}`;
  const report=useRemote<Report>(`/assets/${assetId}/financials${query}`),data=report.data;
  return <details className="evidence"><summary>Asset financials & depreciation</summary>
    <p>USD book values, posted monthly on the in-service anniversary in UTC. Fiscal years include their start date and exclude the next year's start.</p>
    <div className="field-grid">
      <label><span>Book value as of</span><input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label>
      <label><span>Fiscal year starts</span><input type="date" value={fiscalStart} onChange={e=>setFiscalStart(e.target.value)}/><small>First day of the fiscal year's starting month.</small></label>
    </div>
    {report.loading ? <Loading/> : report.error ? <ErrorNotice error={report.error} retry={report.refresh}/>
      : data?.financial ? <>
        <Facts entries={[["Purchase cost",usd(data.financial.purchase_cents)],["Cost center",data.financial.cost_center],
          ["Method",data.financial.method],["In service",data.financial.in_service_date],
          ["Useful life",`${data.financial.useful_months} months`],["Book value",usd(data.bookCents)],
          ["Accumulated depreciation",usd(data.depreciationCents)],
          ["Fiscal-year depreciation",usd(data.fiscalDepreciationCents)]]}/>
        {!data.inService && <p>Asset is not yet in service on the selected date.</p>}
        <p><a href={`/api/v1/assets/${assetId}/financials.csv${query}`} download>Export fiscal-year CSV</a> for Pantry, QuickBooks Online or NetSuite. This downloads a schedule; no accounting provider receives it automatically.</p>
        <div style={{overflowX:"auto"}}><table><caption>Fiscal-year depreciation schedule (USD)</caption>
          <thead><tr><th>Posted (UTC)</th><th>Month</th><th>Depreciation</th><th>Book value</th></tr></thead>
          <tbody>{data.schedule.map(row=><tr key={row.month}><td>{row.date}</td><td>{row.month}</td><td>{usd(row.depreciationCents)}</td><td>{usd(row.bookCents)}</td></tr>)}</tbody>
        </table></div>
        {!data.schedule.length && <p>No depreciation postings in this fiscal year.</p>}
      </> : <p>No financial record. Add the actual purchase cost and accounting policy below.</p>}
    {!report.loading && !report.error && <ActionForm key={`${assetId}:${data?.financial?.revision ?? 0}`}
      title="Record asset financials" path={`/assets/${assetId}/financials`}
      defaults={{revision:data?.financial?.revision ?? 0}}
      fields={[
        {name:'purchaseUsd',label:'Purchase cost (USD)',type:'number',required:true,value:data?.financial ? data.financial.purchase_cents/100 : undefined},
        {name:'costCenter',label:'Cost center',required:true,value:data?.financial?.cost_center},
        {name:'inServiceDate',label:'In-service date',type:'date',required:true,value:data?.financial?.in_service_date},
        {name:'usefulMonths',label:'Useful life (months)',type:'number',required:true,value:data?.financial?.useful_months},
        {name:'method',label:'Depreciation method',type:'select',required:true,value:data?.financial?.method,
          options:[{value:'straight-line',label:'Straight-line'},{value:'declining-balance',label:'Double declining balance'}]},
      ]}
      explanation="Straight-line rounds cumulative expense to cents. Double declining balance expenses 2 ÷ useful months of the opening balance monthly, rounded to cents. Remaining book value is depreciated in the final month; salvage value is zero."
      transform={values=>{const amount=Number(values.purchaseUsd),cents=Math.round(amount*100);
        if (!Number.isFinite(amount) || Math.abs(amount*100-cents)>0.00001) throw Error('Purchase cost must have no more than two decimal places.');
        const {purchaseUsd,...rest}=values;return {...rest,purchaseCents:cents};}}
      onSaved={report.refresh}/>}
  </details>;
}
