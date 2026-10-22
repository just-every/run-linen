import {ApiError} from '../../platform/http';
export const customFieldTypes=['text','dropdown','multiselect','number','boolean','date'] as const;
export type CustomFieldType=typeof customFieldTypes[number];
export type CustomValue=string|string[]|number|boolean|null;
const invalid=():never=>{throw new ApiError(422,'field_value','Give a value matching this field type and its configured choices');};
/** SQL stays compatible with existing text values; history uses the validated native value. */
export function fieldValue(field:{type:CustomFieldType;options:string[]},input:unknown):{stored:string|null;value:CustomValue} {
  if(input===null||input==='')return {stored:null,value:null};
  if(field.type==='text'||field.type==='dropdown') {
    if(typeof input!=='string'||input.length>2000)return invalid();
    const value=input.trim();
    if(field.type==='dropdown'&&value&&!field.options.includes(value))return invalid();
    return {stored:value||null,value:value||null};
  }
  if(field.type==='multiselect') {
    if(!Array.isArray(input)||input.length>100||new Set(input).size!==input.length||!input.every(v=>typeof v==='string'&&field.options.includes(v)))return invalid();
    return input.length?{stored:JSON.stringify(input),value:input}:{stored:null,value:null};
  }
  if(field.type==='number') {
    if(typeof input!=='number'&&(typeof input!=='string'||!/^[-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input)))return invalid();
    const value=Number(input);
    if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))return invalid();
    return {stored:JSON.stringify(value),value};
  }
  if(field.type==='boolean') {
    if(typeof input!=='boolean')return invalid();
    return {stored:JSON.stringify(input),value:input};
  }
  if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input)||!Number.isFinite(Date.parse(input+'T00:00:00Z'))||new Date(input+'T00:00:00Z').toISOString().slice(0,10)!==input)return invalid();
  return {stored:input,value:input};
}
export function storedFieldValue(field:{type:CustomFieldType;options:string[]},stored:string|null):CustomValue {
  if(stored===null)return null;
  let value:unknown=stored;
  if(['multiselect','number','boolean'].includes(field.type)) {
    try {value=JSON.parse(stored);}catch {throw new ApiError(409,'field_stored_value','The stored field value needs owner review');}
  }
  return fieldValue(field,value).value;
}
