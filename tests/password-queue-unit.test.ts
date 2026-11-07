import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptOtp, decryptOtp, retrySeconds, transientHttp } from "../lib/password-reset-queue";
test("encrypted queued OTP preserves code without storing plaintext",()=>{
 const key=randomBytes(32),a=encryptOtp("041229",key),b=encryptOtp("041229",key);
 assert.notEqual(a,b);assert.equal(decryptOtp(a,key),"041229");
 assert.throws(()=>decryptOtp(a,randomBytes(32)));
});
test("queue rate-limit backoff is bounded and observes retry-after",()=>{
 assert.equal(retrySeconds(1),60); assert.equal(retrySeconds(2),120);
 assert.equal(retrySeconds(3,"600"),600); assert.equal(retrySeconds(99),3600);
});
test("sender errors 429 and 5xx are transient, invalid sender is permanent",()=>{
 assert.equal(transientHttp(429),true);assert.equal(transientHttp(503),true);
 assert.equal(transientHttp(403),false);assert.equal(transientHttp(401),false);
});
