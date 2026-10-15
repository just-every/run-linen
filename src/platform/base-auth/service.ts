import { createOperatorAuth, isLoopbackHost } from '../../base/modules/operator-auth/index.mjs'
import { createMailSender } from '../../base/modules/mail/index.mjs'
import type { Env } from '../types'
import { nativeStore } from './store'
import { nativeAccounts } from './accounts'
import { nativeProofs } from './proofs'
import branding from '../../branding.json'
export const theme = { href:'/rer-theme.css',productName:branding.name,accentColor:branding.primaryColor }
export function originBindings(env:Env){const origin=env.RER_DEV_ORIGIN||env.AUTH_ORIGIN||env.APP_ORIGIN||'http://localhost:8810';return {...env,AUTH_ORIGIN:origin,APP_ORIGIN:origin}}
export function localEnabled(env:Env){
 try{return env.AUTH_LOCAL==='true'&&isLoopbackHost(new URL(originBindings(env).AUTH_ORIGIN).hostname)&&!(env.RER_INSTALLATION_ID&&env.RER_MANAGEMENT_ORIGIN&&!isLoopbackHost(new URL(env.RER_MANAGEMENT_ORIGIN).hostname))}catch{return false}
}
export function operatorAuth(env:Env){
 const store=nativeStore(env),local=localEnabled(env)
 const mailSender=!env.MAIL_PROVIDER||env.MAIL_PROVIDER==='development'&&!local&&env.RER_DEMO!=='1'?undefined:{async send(message: import('../../base/modules/operator-auth/index.mjs').MailMessage){
  const sender=env.MAIL_PROVIDER==='development'?createMailSender({provider:'development',mode:'development'}):createMailSender({provider:env.MAIL_PROVIDER,mode:'production',apiKey:env.MAIL_API_KEY,...(env.MAIL_ACCOUNT_ID?{accountId:env.MAIL_ACCOUNT_ID}:{})})
  return sender.send(message)
 }}
 return createOperatorAuth({db:env.DB,accounts:nativeAccounts(store),proofs:nativeProofs(store),config:{origin:originBindings(env).AUTH_ORIGIN,OWNER_EMAIL:env.OWNER_EMAIL||'owner@localhost.test',SESSION_SECRET:env.SESSION_SECRET,SETUP_TOKEN:env.SETUP_TOKEN||env.BOOTSTRAP_TOKEN,local,MAIL_FROM:env.MAIL_FROM||'auth@localhost.test',branding:{productName:theme.productName,accentColor:theme.accentColor,signInPath:'/signin',theme:theme.href}},mailSender,clientIp:request=>local?'local-loopback':request.headers.get('CF-Connecting-IP')||''})
}
