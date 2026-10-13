export function optionalTokenCount(value, field) {
    if (value === undefined || value === null)
        return 0;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative safe integer`);
    }
    return value;
}
export function requiredTokenCount(value, field) {
    if (value === undefined || value === null) {
        throw new Error(`${field} is required`);
    }
    return optionalTokenCount(value, field);
}
export function assertTokenTotal(field, reported, components) {
    const canonical = components.reduce((total, value) => total + value, 0);
    if (reported !== canonical) {
        throw new Error(`${field} (${reported}) does not equal its billed components (${canonical})`);
    }
}
export function assertTokenSubset(field, subset, totalField, total) {
    if (subset > total) {
        throw new Error(`${field} (${subset}) exceeds ${totalField} (${total})`);
    }
}
