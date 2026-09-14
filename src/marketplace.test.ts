import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKETPLACE_TOOLS } from './marketplace.js';

test('stdio marketplace tools route requests with auth and preserve idempotency', async () => {
  const requests: {url: string; method: string; auth?: string; body: Record<string, unknown>}[] = [];
  const api = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({url: req.url!, method: req.method!, auth: req.headers.authorization, body: body ? JSON.parse(body) : {}});
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({data:{ok:true}}));
  });
  await new Promise<void>(r => api.listen(0,'127.0.0.1',r));
  const address = api.address() as {port:number};
  const home = mkdtempSync(join(tmpdir(),'tb-mcp-test-'));
  const entry = join(home, 'taskbounty-mcp-server');
  symlinkSync(join(process.cwd(), 'build/index.js'), entry);
  const connect = async (token: string) => {
    const c = new Client({name:'marketplace-test',version:'1'}, {capabilities:{}});
    await c.connect(new StdioClientTransport({command:process.execPath,args:[entry],env:{HOME:home,TASKBOUNTY_API_KEY:token,TASKBOUNTY_API_BASE:`http://127.0.0.1:${address.port}/api/v1`}})); return c;
  };
  let client: Client | undefined;
  try {
    client=await connect('tb_live_test_fixture');
    const names=(await client.listTools()).tools.map(t=>t.name);
    for(const t of MARKETPLACE_TOOLS) assert.ok(names.includes(t.name),t.name);
    const id='11111111-1111-4111-8111-111111111111';
    const cases: [string,string,string,Record<string,unknown>,string?][]=[
      ['find_agents','/marketplace/agents?q=research&page=1','GET',{q:'research'}],
      ['get_hiring_workspace','/marketplace','GET',{}],
      ['request_agent_quote','/marketplace/requests','POST',{agent_slug:'researcher',title:'Research task',details:'Prepare sourced research',idempotency_key:id}],
      ['quote_agent_work','/marketplace','POST',{hire_request_id:id,idempotency_key:id},'quote'],
      ['accept_agent_quote','/marketplace','POST',{quote_id:id},'accept'],
      ['set_delegation_budget','/marketplace','POST',{parent_task_id:id,per_task_cents:1000,total_cents:2000},'grant'],
      ['delegate_agent_task','/marketplace','POST',{grant_id:id,provider_agent_id:id,idempotency_key:id},'delegate'],
      ['get_mission',`/missions/${id}`,'GET',{mission_id:id}],
      ['invite_mission_agent',`/missions/${id}/invitations`,'POST',{mission_id:id,agent_slug:'agent',context_share_approved:true}],
      ['respond_to_mission_invitation',`/missions/${id}/invitations`,'PATCH',{mission_id:id,status:'accepted'}],
      ['submit_deliverable','/submissions','POST',{task_id:id,agent_id:id,result_text:'Evidence',external_link:'https://example.org/result'}],
    ];
    for(const [name,path,method,args,action] of cases){
      const result=await client.callTool({name,arguments:args}); assert.notEqual(result.isError,true);
      const req=requests.at(-1)!; assert.equal(req.url,'/api/v1'+path); assert.equal(req.method,method); assert.equal(req.auth,'Bearer tb_live_test_fixture');
      if(action) assert.equal(req.body.action,action);
      if(args.idempotency_key) assert.equal(req.body.idempotency_key,args.idempotency_key);
    }
    const count=requests.length;
    assert.equal((await client.callTool({name:'get_mission',arguments:{mission_id:'../../private'}})).isError,true); assert.equal(requests.length,count);
    await client.close(); client=await connect('');
    assert.equal((await client.callTool({name:'get_hiring_workspace',arguments:{}})).isError,true); assert.equal(requests.length,count);
    await client.callTool({name:'find_agents',arguments:{q:'writing'}}); assert.equal(requests.length,count+1); assert.equal(requests.at(-1)!.auth,undefined);
  } finally {await client?.close(); api.close(); rmSync(home,{recursive:true,force:true});}
});
