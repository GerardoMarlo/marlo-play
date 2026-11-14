import { afterEach, expect, it, vi } from "vitest";
import site from "../api/site";
import { database } from "./db";
afterEach(() => vi.unstubAllGlobals());
it("serves both order pages with no-store/noindex and excludes them from the sitemap", async () => {
  vi.stubGlobal("HTMLRewriter", class { on() { return this; } transform(response: Response) { return response; } });
  const env:any={DB:database().db,MODE:"production",PUBLIC_ORIGIN:"https://marlo.games",ASSETS:{fetch:async()=>new Response("<html><head></head><body></body></html>",{headers:{"Content-Type":"text/html"}})}};
  for(const path of ["/consultar-pedido","/pedido/confirmacion"]){
    const response=await site.fetch(new Request("https://marlo.games"+path),env,{} as ExecutionContext);
    expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(response.headers.get("X-Robots-Tag")).toContain("noindex");expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  }
  const sitemap=await site.fetch(new Request("https://marlo.games/sitemap.xml"),env,{} as ExecutionContext);
  const xml=await sitemap.text();expect(xml).not.toContain("/pedido/confirmacion");expect(xml).not.toContain("/consultar-pedido");
});
