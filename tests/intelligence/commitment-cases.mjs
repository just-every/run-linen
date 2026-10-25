import assert from 'node:assert/strict';

export async function commitmentChecks({api, owner, employee, harness, restart, userId, employeeId, mode}) {
    const ok = async (path, method='GET', body, auth=owner) => {
        const r = await api(path, method, body, auth);
        assert.ok(r.status < 300, JSON.stringify({path, ...r})); return r.value;
    };
    const config = {repositoryOwner:'synthetic-linen-owner', repositoryName:'synthetic-linen-repository',
        memberId:userId, githubLogin:'synthetic-linen-1', githubUserId:1};
    const c = await ok('/connections','POST',{provider:'github',name:'Starter repository readback',config,secret:JSON.stringify({token:'synthetic-linen-1'})});
    const tested = await ok(`/connections/${c.id}/test`,'POST',{revision:(await ok('/connections')).find(row=>row.id===c.id).revision});
    assert.equal(tested.evidence.accessVerified,true);
    assert.equal(tested.evidence.workflowVerified,false);
    const spec = {id:'repository',description:'Repository read permission for the explicitly bound starter',
        step:{action:'github.repository.read',actionVersion:1,verifierConnectionId:c.id,verifierConnectionRevision:tested.revision,
            target:config.repositoryOwner+'/'+config.repositoryName,beneficiaryId:userId}};
    const input = {outcome:'Every scheduled starter can read the baseline repository',cohort:[userId,employeeId],observations:[spec],
        freshnessSeconds:600,intervalSeconds:60,dependencies:[],participants:[],sensitivity:'restricted',effectiveAt:new Date(Date.now()-1000).toISOString()};
    assert.equal((await api('/commitments','POST',input,employee)).status,403);
    let commitment = await ok('/commitments','POST',input);
    const read = () => ok(`/commitments/${commitment.id}/coverage`);
    assert.equal((await read()).coverage[0].state,'absent');
    assert.deepEqual((await read()).uncoveredCohorts,[employeeId]);
    const observe = () => ok(`/commitments/${commitment.id}/observe`,'POST',{});
    assert.equal((await observe()).coverage[0].state,'verified');
    const work = await ok('/work','POST',{title:'Starter access check',body:'Track the starter setup',deduplicationKey:crypto.randomUUID()});
    await ok(`/work/${work.id}/commands`,'POST',{revision:work.revision,command:'close',resolutionCode:'Solved (workaround)',reason:'Case closed while service coverage remains open'});
    await restart();
    assert.equal((await ok(`/work/${work.id}`)).work.state,'closed');
    assert.equal((await read()).coverage[0].state,'verified');
    assert.deepEqual((await read()).uncoveredCohorts,[employeeId]);
    for (const value of ['github-none','github-identity','github-repository','github-auth','github-malformed','github-transport']) {
        await mode(value);
        assert.equal((await observe()).coverage[0].state,value==='github-none'?'failed':'uncertain',value);
    }
    await mode('ok');
    assert.equal((await observe()).coverage[0].state,'verified');
    const newest = await (await harness.db).prepare('SELECT evidence_json FROM intelligence_observations WHERE commitment_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(commitment.id).first();
    const proof=JSON.parse(newest.evidence_json);
    assert.equal(proof.source.provider,'github');assert.equal(proof.githubUserId,1);assert.equal(proof.permission,'read');
    const dependent = await ok('/commitments','POST',{...input,dependencies:[commitment.id]});
    assert.equal((await ok(`/commitments/${dependent.id}/coverage`)).dependencies[0].state,'unknown','An uncovered starter keeps a dependency unknown');
    commitment = await ok(`/commitments/${commitment.id}`,'PATCH',{revision:commitment.revision,cohort:[userId]});
    assert.equal((await read()).coverage[0].state,'absent','Changed service scope needs new evidence');
    assert.equal((await observe()).coverage[0].state,'verified');
    assert.equal((await ok(`/commitments/${dependent.id}/coverage`)).dependencies[0].state,'verified');
    const db=await harness.db;
    await db.prepare('UPDATE intelligence_observations SET observed_at=? WHERE commitment_id=?').bind(new Date(Date.now()-601000).toISOString(),commitment.id).run();
    assert.equal((await read()).coverage[0].state,'stale');
    assert.equal((await ok(`/commitments/${dependent.id}/coverage`)).dependencies[0].state,'unknown');
    await observe();
    await ok(`/connections/${c.id}/disconnect`,'POST',{revision:tested.revision});
    assert.equal((await read()).coverage[0].state,'uncertain','Connection withdrawal invalidates prior health');
    assert.equal((await observe()).coverage[0].state,'uncertain');
    await ok(`/commitments/${commitment.id}`,'PATCH',{revision:commitment.revision,expiresAt:new Date(Date.now()-1).toISOString()});
    assert.equal((await api(`/commitments/${commitment.id}/observe`,'POST',{},owner)).status,409);
    console.log('PASS persistent repository commitment: owner binding, closure and restart, uncovered starter, changing scope, provider denial and uncertainty, stale dependencies, withdrawal and retirement');
}
