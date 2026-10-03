import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../app/api/[...path]/route';
test('API mendeteksi database kosong dan menolak permintaan dari domain lain',async()=>{
 const old=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
 try{const health=await GET(new NextRequest('http://localhost:3000/api/health'),{params:Promise.resolve({path:['health']})});assert.equal((await health.json()).configured,false);
 const denied=await POST(new NextRequest('http://localhost:3000/api/pay',{method:'POST',headers:{origin:'https://attacker.test'},body:'{}'}),{params:Promise.resolve({path:['pay']})});assert.equal(denied.status,403);
 const noDb=await POST(new NextRequest('http://localhost:3000/api/auth/register',{method:'POST',headers:{origin:'http://localhost:3000'},body:'{}'}),{params:Promise.resolve({path:['auth','register']})});assert.equal(noDb.status,503);
 }finally{if(old)process.env.DATABASE_URL=old;}
});
