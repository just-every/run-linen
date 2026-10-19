import { ApiError, requiredString } from '../../platform/http';
/** Optional recorded grouping facts; no model inference or authority comes from these labels. */
export function recurrenceContext(value: unknown) {
  if(value === undefined)return {};
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new ApiError(400,'recurrence_context','Grouping context must be an object');
  return Object.fromEntries(['deviceModel','app','location'].filter(key=>key in value).map(key=>[key,requiredString((value as Record<string,unknown>)[key],key,200)]));
}
