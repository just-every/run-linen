interface IdentityEnv {DB:D1Database;ENCRYPTION_KEY:string}
interface IdentityContext {env:IdentityEnv;principal:{workspaceId:string}}
interface CaptureInput {eventId:string;store:'audit'|'service';payload:unknown;redactedPayload:unknown;identities:string[];canonicalPersonKey:string;personFields:string[];at:string;actorId?:string;redactedActorId?:string}
export function captureArchiveAliasStatements(ctx:IdentityContext,input:CaptureInput):Promise<D1PreparedStatement[]>;
export function archiveIdentityDigest(env:Pick<IdentityEnv,'ENCRYPTION_KEY'>,workspace:string,value:string):Promise<string>;
export function archiveIdentityMatches(env:Pick<IdentityEnv,'ENCRYPTION_KEY'>,workspace:string,value:string,digest:string):Promise<boolean>;
export function archiveHmac(env:Pick<IdentityEnv,'ENCRYPTION_KEY'>,domain:string,...parts:unknown[]):Promise<string>;
export function isArchiveAlias(value:unknown):value is string;
export function isArchiveTombstone(value:unknown):value is string;
export function prepareArchiveIdentityProjection(env:IdentityEnv):Promise<{project:(table:string,row:Record<string,any>)=>Record<string,any>;validateStaged:(input:{db:D1Database;tables:Record<string,string>})=>Promise<boolean>}>;
export function validateArchiveIdentityStaged(input:{db:D1Database;tables:Record<string,string>}):Promise<boolean>;
export function captureKnownArchiveAliasStatements(ctx:IdentityContext,input:Omit<CaptureInput,'identities'|'canonicalPersonKey'>):Promise<D1PreparedStatement[]>;
