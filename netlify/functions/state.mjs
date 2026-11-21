const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(data)});
export async function handler(event){
 if(!['GET','POST'].includes(event.httpMethod))return reply(405,{erro:'Método não permitido'});
 const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=process.env.SUPABASE_ANON_KEY;
 if(!/^https:\/\/[^/]+/.test(url)||!key)return reply(503,{erro:'Configure SUPABASE_URL e SUPABASE_ANON_KEY no Netlify'});
 const auth=event.headers.authorization||event.headers.Authorization||'';
 if(!/^Bearer\s+\S+$/.test(auth))return reply(401,{erro:'Faça login para acessar o caixa'});
 const headers={apikey:key,Authorization:auth,'Content-Type':'application/json'};
 try{
  const user=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(12000)});
  if(!user.ok)return reply(401,{erro:'Sessão inválida ou expirada'});
  if(event.httpMethod==='GET'){
   const res=await fetch(url+'/rest/v1/mykey_estado?select=conteudo,revisao&id=eq.1',{headers,signal:AbortSignal.timeout(20000)});
   const data=await res.json();
   if(!res.ok)return reply(res.status===403?403:502,{erro:data.message||'Erro ao ler o banco'});
   if(!Array.isArray(data)||data.length!==1)return reply(404,{erro:'Estado financeiro não encontrado'});
   return reply(200,{payload:data[0].conteudo,revision:Number(data[0].revisao)});
  }
  if((event.body?.length||0)>8*1024*1024)return reply(413,{erro:'Estado acima de 8 MB'});
  const revision=Number(event.headers['x-expected-revision']);
  if(!Number.isSafeInteger(revision)||revision<0)return reply(400,{erro:'Revisão obrigatória'});
  let payload;try{payload=JSON.parse(event.body||'')}catch{return reply(400,{erro:'JSON inválido'})}
  if(!payload||typeof payload!=='object'||!['accounts','moves','bills','suppliers','bank'].every(k=>Array.isArray(payload[k])))return reply(400,{erro:'Estrutura financeira inválida'});
  const res=await fetch(url+'/rest/v1/rpc/mykey_salvar_estado',{method:'POST',headers,body:JSON.stringify({p_conteudo:payload,p_revisao_esperada:revision}),signal:AbortSignal.timeout(25000)});
  const data=await res.json();
  if(!res.ok){const message=String(data.message||'Erro ao salvar');return reply(message.includes('Conflito de revisão')||data.code==='40001'?409:res.status===403?403:502,{erro:message})}
  return reply(200,{ok:true,revision:Number(data)});
 }catch(e){return reply(502,{erro:'Falha de comunicação com o Supabase: '+String(e.message||'indisponível')})}
}
