import { useRemote } from './state';
import { Empty, ErrorNotice, Hero, Loading } from './primitives';
import type { SearchType } from '../features/work/search-sources';
const labels:Record<SearchType,string>={ticket:'Tickets',person:'People',asset:'Assets',ci:'Configuration items',change:'Changes',problem:'Problems',catalog:'Catalog items',article:'Articles'};
interface SearchResult {id:string;type:SearchType;title:string;summary:string;href:string|null;identityKind?:string}
export function SearchSpace({query,parameters}:{query:string;parameters:string}) {
  const params=new URLSearchParams(parameters), type=params.get('type')||'',offset=Number(params.get('offset')||0);
  const result=useRemote<{items:SearchResult[];counts:Record<SearchType,number>;total:number;pageSize:number}>(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&offset=${offset}`);
  function link(next:number) {return `#/search?q=${encodeURIComponent(query)}${type?'&type='+encodeURIComponent(type):''}&offset=${next}`;}
  return <>
    <Hero title="Workspace search"><p className="lead">Find tickets, people, devices and service records within your current permissions.</p></Hero>
    <form key={`${query}/${type}`} className="knowledge-search" role="search" aria-label="Workspace search" onSubmit={event=>{
      event.preventDefault();const values=new FormData(event.currentTarget);
      location.hash=`/search?q=${encodeURIComponent(String(values.get('q')||'').trim())}&type=${encodeURIComponent(String(values.get('type')||''))}`;
    }}>
      <label>Search workspace<input name="q" type="search" defaultValue={query} maxLength={200}/></label>
      <label>Record type<select name="type" defaultValue={type}><option value="">All record types</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <button className="action secondary">Search</button>
    </form>
    {result.loading?<Loading/>:result.error?<ErrorNotice error={result.error} retry={result.refresh}/>:result.data&&<>
      <p role="status">{result.data.total} visible {result.data.total===1?'result':'results'}{query?` for “${query}”`:''}.</p>
      {result.data.total>0&&<p>{Object.entries(labels).filter(([t])=>result.data!.counts[t as SearchType]>0).map(([t,label])=>`${label}: ${result.data!.counts[t as SearchType]}`).join(' · ')}</p>}
      {result.data.items.map(item=><article className="connection-record" key={`${item.type}:${item.identityKind||''}:${item.id}`} aria-label={`${item.title} search result`}>
        <p className="eyebrow">{labels[item.type]}</p>
        <h2>{item.href?<a href={item.href}>{item.title}</a>:item.title}</h2><p>{item.summary}</p>
      </article>)}
      {!result.data.items.length&&<Empty title={query?'No visible records matched.':'Enter a name, serial or question.'}>Search matches recorded text and allows a single-character typo in words of at least four characters.</Empty>}
      <nav aria-label="Search pages">{offset>0&&<a href={link(Math.max(0,offset-result.data.pageSize))}>Previous results</a>}{offset+result.data.pageSize<result.data.total&&<a href={link(offset+result.data.pageSize)}>Next results</a>}</nav>
    </>}
  </>;
}
