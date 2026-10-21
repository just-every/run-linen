import { ApiError } from '../../platform/http'

export type CatalogField = {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'date'
  required: boolean
  options?: string[]
  when?: { fieldId: string; equals: string | number | boolean }
}

export type CatalogForm = {
  fields: CatalogField[]
  costCents: number | null
  deliveryHours: number | null
}

type Answer = string | number | boolean
type Invalid = (message: string) => never
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const invalidForm: Invalid = message => { throw new ApiError(422, 'catalog_form_invalid', message) }
const invalidAnswers: Invalid = message => { throw new ApiError(422, 'catalog_answers_invalid', message) }
const fieldTypes = new Set(['text', 'textarea', 'number', 'checkbox', 'select', 'date'])

function object(value: unknown, name: string, invalid: Invalid): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(`${name} must be an object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return invalid(`${name} must be a plain object`)
  return value as Record<string, unknown>
}

function knownKeys(value: object, keys: string[], name: string, invalid: Invalid): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) invalid(`${name} contains an unknown property: ${String(key)}`)
  }
}

function nonemptyString(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    return invalidForm(`${name} must be nonempty text of at most ${max} characters`)
  }
  return value
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

function answerMatches(field: CatalogField, value: unknown): value is Answer {
  switch (field.type) {
    case 'text':
    case 'textarea': return typeof value === 'string' && value.length <= 4000
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'checkbox': return typeof value === 'boolean'
    case 'select': return typeof value === 'string' && !!field.options?.includes(value)
    case 'date': return typeof value === 'string' && validDate(value)
  }
}

function quantity(value: unknown, name: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return invalidForm(`${name} must be an integer from ${min} to ${max}, or null`)
  }
  return value
}

export function normalizeCatalogForm(value: unknown): CatalogForm {
  if (value === undefined || value === null) return { fields: [], costCents: null, deliveryHours: null }
  const input = object(value, 'Catalog form', invalidForm)
  knownKeys(input, ['fields', 'costCents', 'deliveryHours'], 'Catalog form', invalidForm)
  const rawFields = input.fields === undefined ? [] : input.fields
  if (!Array.isArray(rawFields) || rawFields.length > 20) return invalidForm('Catalog form must contain at most 20 fields')
  const fields: CatalogField[] = []
  const byId = new Map<string, CatalogField>()
  for (const raw of rawFields) {
    const item = object(raw, 'Catalog field', invalidForm)
    knownKeys(item, ['id', 'label', 'type', 'required', 'options', 'when'], 'Catalog field', invalidForm)
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(item.id)) {
      return invalidForm('Field id must start with a lowercase letter and contain at most 40 lowercase letters, digits or underscores')
    }
    if (byId.has(item.id)) return invalidForm(`Duplicate field id: ${item.id}`)
    const label = nonemptyString(item.label, 120, `Label for ${item.id}`)
    if (typeof item.type !== 'string' || !fieldTypes.has(item.type)) return invalidForm(`Unsupported field type for ${item.id}`)
    if (item.required !== undefined && typeof item.required !== 'boolean') return invalidForm(`Required for ${item.id} must be a boolean`)
    const field: CatalogField = { id: item.id, label, type: item.type as CatalogField['type'], required: item.required === true }
    if (field.type === 'select') {
      if (!Array.isArray(item.options) || item.options.length < 1 || item.options.length > 30) {
        return invalidForm(`Select field ${field.id} must have 1 to 30 options`)
      }
      const options = Array.from(item.options, option => nonemptyString(option, 120, `Option for ${field.id}`))
      if (new Set(options).size !== options.length) return invalidForm(`Select field ${field.id} has duplicate options`)
      field.options = options
    } else if (owns(item, 'options')) {
      return invalidForm(`Only select fields may have options: ${field.id}`)
    }
    if (owns(item, 'when')) {
      const condition = object(item.when, `Condition for ${field.id}`, invalidForm)
      knownKeys(condition, ['fieldId', 'equals'], `Condition for ${field.id}`, invalidForm)
      if (typeof condition.fieldId !== 'string' || !byId.has(condition.fieldId)) {
        return invalidForm(`Condition for ${field.id} must reference an earlier field`)
      }
      const prior = byId.get(condition.fieldId)!
      if (!owns(condition, 'equals') || !answerMatches(prior, condition.equals)) {
        return invalidForm(`Condition for ${field.id} must equal a valid value for ${prior.id}`)
      }
      field.when = { fieldId: condition.fieldId, equals: condition.equals }
    }
    fields.push(field)
    byId.set(field.id, field)
  }
  return {
    fields,
    costCents: quantity(input.costCents, 'Cost in USD cents', 0, 1_000_000_000),
    deliveryHours: quantity(input.deliveryHours, 'Delivery in elapsed hours', 1, 87_600),
  }
}

export function fieldVisible(field: CatalogField, answers: Record<string, Answer>): boolean {
  return !field.when || (owns(answers, field.when.fieldId) && answers[field.when.fieldId] === field.when.equals)
}

export function validateCatalogAnswers(form: CatalogForm, value: unknown): Record<string, Answer> {
  const input = object(value, 'Catalog answers', invalidAnswers)
  knownKeys(input, form.fields.map(field => field.id), 'Catalog answers', invalidAnswers)
  const answers: Record<string, Answer> = {}
  for (const field of form.fields) {
    const supplied = owns(input, field.id)
    if (!fieldVisible(field, answers)) {
      if (supplied) return invalidAnswers(`Hidden field ${field.id} must not be supplied`)
      continue
    }
    if (!supplied) {
      if (field.required) throw new ApiError(422,'catalog_field_required',`${field.label} is required`)
      continue
    }
    const answer = input[field.id]
    if (!answerMatches(field, answer)) return invalidAnswers(`${field.label} must contain a valid ${field.type} value`)
    if (field.required && typeof answer === 'string' && !answer.trim()) throw new ApiError(422,'catalog_field_required',`${field.label} is required`)
    answers[field.id] = answer
  }
  return answers
}
