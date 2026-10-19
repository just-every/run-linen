import type { Principal } from '../../platform/types';
import { getService, type ServiceRecord } from './store';
import { serviceGraph } from './graph';

/** Edges point from the dependent to its dependency. Stale/conflicting paths are possible impact, never a verified fact. */
export async function dependencyImpact(db: D1Database, p: Principal, record: ServiceRecord) {
  const roots: string[] = record.kind === 'change' ? record.data.services : record.kind === 'incident' ? [record.data.serviceId] : [record.id];
  for (const root of roots) await getService(db, p, root, 'service');
  const graph = await serviceGraph(db, p), rootSet = new Set(roots);
  const edges = graph.edges.filter(e => e.data.value === true && ['depends_on', 'hosted_on', 'runs_on', 'uses'].includes(e.data.relationship));
  const walk = (reverse: boolean) => {
    const certainty = new Map(roots.map(root => [root, true])), queue = [...roots];
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges) {
        const from = reverse ? edge.data.to : edge.data.from, to = reverse ? edge.data.from : edge.data.to;
        if (from !== current) continue;
        const certain = certainty.get(current)! && edge.fresh && Date.parse(edge.data.effectiveAt) <= Date.now() && edge.conflicts.length === 0;
        if (!certainty.has(to) || (certain && !certainty.get(to))) { certainty.set(to, certain); queue.push(to); }
      }
    }
    return graph.nodes.filter(n => certainty.has(n.id) && !rootSet.has(n.id)).map(node => ({ ...node, certainty: certainty.get(node.id) ? 'recorded' : 'uncertain' }));
  };
  const upstream = walk(false), downstream = walk(true);
  const relevant = new Set([...roots, ...upstream.map(n => n.id), ...downstream.map(n => n.id)]);
  return { roots, upstream, downstream, relationships: graph.edges.filter(e => relevant.has(e.data.from) && relevant.has(e.data.to)), coverage: graph.coverage };
}
