// Every word on the run site's homepage, exactly as the approved style spec settles it.
// Components read from here; nothing else on the homepage carries copy.

export const page = {
  title: 'Linen — Ask once. Get back to work.',
  description: 'Linen is a 100% free, open source IT service desk. People ask in their own words; Linen does the routine work and checks it worked.',
}

export const hero = {
  title: ['Ask once. Get', 'back to work.'] as const,
  sub: 'People ask in their own words. Linen does the routine work and checks it worked.',
  alternatives: '100% free, open source alternative to Freshservice and Jira Service Management',
  primary: 'Run Linen',
  secondary: 'Read the docs',
  note: 'Free and open source, MIT licensed.',
  drawingLabel: 'A request asked once, verified, and its access removal scheduled.',
  composer: { label: 'What would make work easier?', message: 'I need Orders access for the west-region cover this week.', send: 'Send' },
  request: { title: 'Requested access', badge: 'verified' },
  removal: { title: 'Access removal · Fri 17:00', line: 'No acknowledgement is needed.' },
}

export const free = {
  title: ['100% free.', 'Yours to keep.'] as const,
  line: 'Linen is MIT licensed. Run it, change it and keep every record.',
  card: ['MIT License', 'free of charge'] as const,
}

export const handover = {
  title: ['A good start. A', 'careful handover.'] as const,
  line: 'Joining, moving and leaving each keep their own steps. Access and devices stay separate until each is done.',
  rows: [
    { title: 'Requested access', badge: 'verified' },
    { title: 'Device delivery', chip: 'Next owner: Casey' },
  ],
}

export const decisions = {
  title: ['Just the choices', 'that need you.'] as const,
  line: 'A clear recommendation, its consequences, and the facts that matter. Routine authorised work carries on.',
  card: 'A choice that needs you',
  facts: ['The recommendation', 'People affected', 'Reversibility'],
}

export const desk = {
  title: ['The rest of your', 'service desk.'] as const,
  tiles: [
    { label: 'Useful knowledge', line: 'An answer with a source.', icon: 'book' },
    { label: 'Shared interruptions', line: 'Recovery, person by person.', icon: 'refresh' },
    { label: 'Devices & custody', line: 'Know where things stand.', icon: 'laptop' },
    { label: 'Changes & releases', line: 'Make change with care.', icon: 'gear' },
    { label: 'Service catalogue', line: 'Or choose a known service.', icon: 'grid' },
    { label: 'Private notes', line: 'Hidden from employees without service-team access.', icon: 'file' },
  ],
}

export const beside = {
  title: ['Try it beside', 'what you have.'] as const,
  line: 'Connect Freshservice, review what comes across, and keep your current desk running while you decide.',
  desk: 'Freshservice existing desk',
  caption: 'Bring the history. Keep your choices.',
}

export const closing = {
  title: 'Give everyone one place to ask.',
  line: 'Free and open source, MIT licensed.',
}

export const footer = {
  line: 'An open source IT service desk.',
  licence: 'MIT licence',
}
