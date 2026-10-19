import { ApiError } from '../../platform/http';
export type Financial = {
  purchase_cents:number; in_service_date:string; useful_months:number;
  method:'straight-line'|'declining-balance'; cost_center:string; revision:number;
};
export function calendarDate(value:unknown, field:string):string {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)
    throw new ApiError(422,'financial_date',`${field} requires an actual YYYY-MM-DD date`);
  return value;
}
function anniversary(start:string, month:number) {
  const date=new Date(start+'T00:00:00Z'),day=date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()+month);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));
  return date.toISOString().slice(0,10);
}
export function depreciationSchedule(financial:Financial) {
  let book=financial.purchase_cents;
  return Array.from({length:financial.useful_months},(_,index)=>{
    const month=index+1,opening=book;
    // Round cumulative straight-line expense, so cent remainders do not accumulate.
    book=month===financial.useful_months ? 0 : financial.method==='straight-line'
      ? financial.purchase_cents-Math.round(financial.purchase_cents*month/financial.useful_months)
      : Math.max(0,book-Math.round(book*2/financial.useful_months));
    return {month,date:anniversary(financial.in_service_date,month),openingCents:opening,
      depreciationCents:opening-book,bookCents:book};
  });
}
export function financialReport(financial:Financial, asOf:string, fiscalStart:string) {
  const all=depreciationSchedule(financial),end=anniversary(fiscalStart,12);
  const completed=all.filter(row=>row.date<=asOf);
  const schedule=all.filter(row=>row.date>=fiscalStart && row.date<end);
  return {financial,currency:'USD',asOf,fiscalStart,fiscalEndExclusive:end,
    bookCents:completed.at(-1)?.bookCents ?? financial.purchase_cents,
    depreciationCents:financial.purchase_cents-(completed.at(-1)?.bookCents ?? financial.purchase_cents),
    inService:asOf>=financial.in_service_date,schedule,
    fiscalDepreciationCents:schedule.reduce((sum,row)=>sum+row.depreciationCents,0)};
}
