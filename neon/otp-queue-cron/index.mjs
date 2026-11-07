export default {
  async fetch(req) {
    if (req.method !== "POST") return new Response("Method Not Allowed",{status:405});
    const url=process.env.BIMBEL_WORKER_URL, secret=process.env.CRON_SECRET;
    if (!url || !secret) return new Response("Not configured",{status:503});
    try {
      const response=await fetch(url,{headers:{authorization:"Bearer "+secret},signal:AbortSignal.timeout(20000)});
      return new Response(JSON.stringify({ok:response.ok}),{
        status:response.ok?200:502,headers:{"content-type":"application/json"}
      });
    } catch { return new Response("Worker unreachable",{status:503}); }
  }
};
