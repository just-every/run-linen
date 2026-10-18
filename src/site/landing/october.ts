// One 212-person US company's October 2026 in IT, as the homepage tells it (design desk page s1, 17 Oct 2026).
// Every section reads its figures from here, so a record shows the same values wherever it appears:
// Maya Chen's laptop in the hero, the plan, the custody card and day one; Figma in the request and the licenses;
// Wes Calloway's laptop in the leave card and the report's open item. Oct 1, 2026 is a Thursday.

export const company = { people: 212, office: 'Denver, CO' }

export const maya = {
  name: 'Maya Chen', initials: 'MC', title: 'Product Designer', team: 'Design', city: 'Austin, TX', employment: 'W-2',
  manager: 'Erin Walsh', buddy: 'Leo Park', starts: 'Mon Oct 19',
}

export const laptop = {
  model: 'MacBook Pro 14', serial: 'L4QX7RMW2K', asset: 'LT-0388', tracking: 'UPS 1Z7X421E0388412706',
  delivered: 'Fri Oct 16', deliveredAt: '2:41 PM', enrolledAt: '5:12 PM',
}

/** The nine baseline apps for Design · Austin · W-2: the nine access rows on day one. */
export const baseline = ['Okta', 'Google Workspace', 'Slack', 'GitHub', 'Zoom', 'Notion', 'Loom', 'Miro', 'Linear'] as const

export const stock = { room: 'Denver IT room', before: 3, after: 2, units: 2, unitPrice: 1999 }

export const dayOne = {
  readyAt: '9:47 AM',
  access: [
    ['Okta', 'first sign-in 8:52 AM'], ['Google Workspace', 'mail received 8:53 AM'], ['Slack', 'posted in #design 9:03 AM'],
    ['GitHub', 'signed in 9:12 AM'], ['Notion', 'signed in 9:21 AM'], ['Zoom', 'joined welcome call 9:30 AM'],
    ['Loom', 'signed in 9:40 AM'], ['Miro', 'signed in 9:44 AM'], ['Linear', 'signed in 9:47 AM'],
  ],
  device: [['MacBook Pro 14', 'delivered Fri Oct 16'], ['Jamf', 'enrolled · compliant'], ['FileVault', 'on']],
  people: [['Buddy · Leo Park', 'first DM 9:05 AM'], ['Welcome call with HR', '9:30 AM']],
} as const

export const priya = { name: 'Priya Patel', city: 'Portland, OR', manager: 'Ravi Shah', resetAt: '9:04 AM', backAt: '9:06 AM' }

export const wes = {
  name: 'Wes Calloway', city: 'Denver, CO', manager: 'Kate Liu', laptop: 'MacBook Air', serial: 'C02FJ8LKQ6L4',
  apps: [
    ['Okta', 'disabled · sessions revoked', '5:00 PM'], ['Slack', 'deactivated', '5:00 PM'], ['Zoom', 'removed · seat reclaimed', '5:00 PM'],
    ['Notion', 'removed', '5:00 PM'], ['Google Workspace', 'suspended · 1,204 files to Kate Liu', '5:01 PM'],
    ['Salesforce', 'frozen · records to Kate Liu', '5:01 PM'], ['Loom', 'removed · seat reclaimed', '5:01 PM'],
    ['Calendly', 'found in Google token grants · revoked', '5:02 PM'], ['GitHub', 'error 502 → retried · removed', '5:03 PM'],
  ],
} as const

export const ines = { name: 'Ines Duarte', city: 'Brooklyn, NY', title: 'Account Executive', manager: 'Chris Morgan' }

export const report = {
  rows: [
    { type: 'Access and apps', requests: 168, verified: 168, before: 1512, after: 64 },
    { type: 'Account recovery', requests: 74, verified: 74, before: 666, after: 148 },
    { type: 'Laptops and hardware', requests: 23, verified: 22, before: 690, after: 115 },
    { type: 'Joiners and leavers', requests: 12, verified: 12, before: 1440, after: 180 },
  ],
}
export const reportTotal = report.rows.reduce((sum, row) => ({
  requests: sum.requests + row.requests, verified: sum.verified + row.verified, before: sum.before + row.before, after: sum.after + row.after,
}), { requests: 0, verified: 0, before: 0, after: 0 })

export const freshservice = [
  ['Tickets', 18406], ['Private notes', 9212], ['Attachments · matched by hash', 6830], ['Assets', 312],
  ['Catalog items', 46], ['Knowledge articles', 128], ['SLA policies', 4],
] as const

export const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export const count = (value: number) => value.toLocaleString('en-US')
