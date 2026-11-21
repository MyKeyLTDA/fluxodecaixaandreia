// Adaptador de compatibilidade para o frontend legado.
// Acesso restrito via token (renovado automaticamente) e revisão otimista.
(function(){
 const cfg=window.MYKEY_CONFIG||{};
 let session;
 try{session=JSON.parse(sessionStorage.getItem('mykey_session')||'null')}catch{}
 function logout(){sessionStorage.removeItem('mykey_session');location.replace('/login.html');throw Error('Sessão expirada');}
 function refresh(){
  if(!session?.refresh_token)return false;
  try{
   const x=new XMLHttpRequest();
   x.open('POST',String(cfg.supabaseUrl).replace(/\/$/,'')+'/auth/v1/token?grant_type=refresh_token',false);
   x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('apikey',cfg.supabaseAnonKey);
   x.send(JSON.stringify({refresh_token:session.refresh_token}));
   const d=JSON.parse(x.responseText||'null');
   if(x.status!==200||!d?.access_token)return false;
   session={access_token:d.access_token,refresh_token:d.refresh_token||session.refresh_token,expires_at:Date.now()+d.expires_in*1000};
   sessionStorage.setItem('mykey_session',JSON.stringify(session));
   return true;
  }catch{return false}
 }
 function ensure(){
  if(!session?.access_token)logout();
  if(Date.now()>session.expires_at-60000&&!refresh())logout();
 }
 ensure();
 let revision=null;
 function send(method,payload){
  const req=new XMLHttpRequest();req.open(method,'/api/state',false);
  req.setRequestHeader('Authorization','Bearer '+session.access_token);
  if(method==='POST'){req.setRequestHeader('Content-Type','application/json');req.setRequestHeader('X-Expected-Revision',String(revision));}
  try{req.send(payload===undefined?null:payload)}catch{throw Error('Servidor online indisponível');}
  return req;
 }
 function request(method,payload){
  ensure();
  let req=send(method,payload);
  if(req.status===401&&refresh())req=send(method,payload);
  let response;try{response=JSON.parse(req.responseText||'null')}catch{}
  if(req.status===409){alert('Outro usuário alterou o caixa. A página será recarregada para evitar sobrescrever dados.');location.reload();throw Error('Conflito de edição');}
  if(req.status===401)logout();
  if(req.status<200||req.status>=300)throw Error(response?.erro||'Falha HTTP '+req.status);
  return response;
 }
 window.dbGet=function(){const result=request('GET');revision=result.revision;return JSON.stringify(result.payload)};
 window.dbSet=function(value){if(revision===null)throw Error('Estado não carregado');const result=request('POST',value);revision=result.revision;};
 window.sqliteRequest=function(method,payload,route='/api/state'){
  if(route!=='/api/state')throw Error('Operação disponível apenas no MyKey Caixa local');
  if(method==='GET')return window.dbGet();
  if(method==='POST'){window.dbSet(payload);return '{"ok":true}';}
  throw Error('Método não suportado');
 };
 window.addEventListener('load',()=>{
  const b=document.createElement('button');b.textContent='Sair';b.type='button';b.style.cssText='position:fixed;right:10px;top:8px;z-index:999';b.onclick=()=>{sessionStorage.removeItem('mykey_session');location.replace('/login.html')};document.body.appendChild(b);
 });
})();
