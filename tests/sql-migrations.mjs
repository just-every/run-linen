import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// SQLite recognizes trigger bodies, quoted semicolons and comments. Keep every
// statement's text and position: migrations may replace a trigger in one file.
export function sqlStatements(...sources) {
  return JSON.parse(execFileSync('python3', ['-c', String.raw`
import json, re, sqlite3, sys
statements = []
for source in json.load(sys.stdin):
    pending = ''
    for char in source:
        pending += char
        if char == ';' and sqlite3.complete_statement(pending):
            statements.append(pending)
            pending = ''
    if not re.fullmatch(r'(?:\s|--[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)*', pending):
        raise ValueError('Incomplete SQL migration statement')
print(json.dumps(statements))
`], { input: JSON.stringify(sources), encoding: 'utf8' }));
}

export async function applyMigrations(db, directory = 'migrations') {
  const names = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  const sources = await Promise.all(names.map(file => readFile(join(directory, file), 'utf8')));
  for (const statement of sqlStatements(...sources)) await db.prepare(statement).run();
}
