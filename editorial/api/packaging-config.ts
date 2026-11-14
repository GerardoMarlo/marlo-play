import { provisionalPackaging, packagingConfigSchema } from '../src/packaging';
import type { Env } from './types';
export async function packagingEnvironment(e:Env):Promise<Env>{
  const row=await e.DB.prepare("SELECT data FROM content WHERE id='shipping:packaging'").first<{data:string}>();
  // v1 env values were flat bag dimensions; never reuse them as verified parcels.
  const raw=row?JSON.parse(row.data):provisionalPackaging;
  const config=packagingConfigSchema.parse(raw);
  return {...e,SHIPPING_PACKAGING_JSON:JSON.stringify(config)};
}
