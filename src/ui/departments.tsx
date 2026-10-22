import { useRemote } from './state';
import type { Field } from './forms';
export interface Department { id:string;name:string;kind:string;active:boolean;revision:number;canStaff:boolean }
export interface DepartmentMember {userId:string;name:string;email:string;active:boolean}
export interface AdminDepartment extends Department {members:DepartmentMember[]}
export interface DepartmentAdmin {items:AdminDepartment[];people:{id:string;name:string;email:string;roles:string[]}[]}
export const departmentKinds=[['it','IT'],['hr','HR service'],['facilities','Facilities'],['finance','Finance'],['legal','Legal'],['custom','Other service team']] as const;
export function useDepartments() {return useRemote<{items:Department[]}>('/departments');}
export function departmentField(items:Department[],value?:string|null):Field {
  return {name:'departmentId',label:'Service workspace',type:'select',value:value??'',hint:'Leave unselected for the shared service desk.',options:items.filter(d=>d.active&&d.canStaff).map(d=>({value:d.id,label:d.name}))};
}
export function DepartmentSelect({items,value,onChange,label='Service workspace',empty='Shared service desk',name='departmentId'}:{items:Department[];value:string;onChange:(value:string)=>void;label?:string;empty?:string;name?:string}) {
  return <label>{label}<select name={name} value={value} onChange={event=>onChange(event.target.value)}><option value="">{empty}</option>{value&&!items.some(d=>d.id===value&&d.active)&&<option value={value} disabled>Current workspace is unavailable</option>}{items.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>;
}
