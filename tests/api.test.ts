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

test('API mengizinkan domain deployment sendiri walau APP_URL memakai domain utama', async () => {
  const oldDb = process.env.DATABASE_URL;
  const oldUrl = process.env.APP_URL;
  delete process.env.DATABASE_URL;
  process.env.APP_URL = 'https://bantu-beres-bimbel-pro.vercel.app';
  const alias = 'https://bantu-beres-bimbel-pro-hudbrother62-2859.vercel.app';
  try {
    const own = await POST(new NextRequest(alias + '/api/auth/login', {
      method: 'POST', headers: { origin: alias }, body: '{}',
    }), { params: Promise.resolve({ path: ['auth', 'login'] }) });
    assert.equal(own.status, 503);

    const other = await POST(new NextRequest(alias + '/api/auth/login', {
      method: 'POST', headers: { origin: 'https://example-attacker.test' }, body: '{}',
    }), { params: Promise.resolve({ path: ['auth', 'login'] }) });
    assert.equal(other.status, 403);
  } finally {
    if (oldDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDb;
    if (oldUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldUrl;
  }
});

test("health melaporkan kesiapan OTP tanpa mengekspos API key", async () => {
  const oldDb = process.env.DATABASE_URL;
  const oldKey = process.env.RESEND_API_KEY;
  const oldSender = process.env.PASSWORD_RESET_FROM;
  delete process.env.DATABASE_URL;
  process.env.RESEND_API_KEY = "dummy-unit-test";
  process.env.PASSWORD_RESET_FROM = "Bimbel <test@example.test>";
  try {
    const response = await GET(new NextRequest("http://localhost:3000/api/health"), {
      params: Promise.resolve({ path: ["health"] }),
    });
    const result = await response.json();
    assert.equal(result.passwordResetAvailable, true);
    assert.equal(JSON.stringify(result).includes("dummy-unit-test"), false);
  } finally {
    if (oldDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDb;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldSender === undefined) delete process.env.PASSWORD_RESET_FROM;
    else process.env.PASSWORD_RESET_FROM = oldSender;
  }
});
