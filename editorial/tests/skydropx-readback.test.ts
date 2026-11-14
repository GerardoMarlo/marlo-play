import { afterEach, expect, it, vi } from 'vitest';
import { getShipment } from '../api/skydropx';
import type { Env } from '../api/types';

afterEach(() => vi.unstubAllGlobals());
it('reads the singular package resource returned by Skydropx with label and tracking', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ access_token: 'sandbox-token', expires_in: 3600 }))
    .mockResolvedValueOnce(Response.json({
      data: { id: 'shipment-test', attributes: { workflow_status: 'success', total: '111.78' } },
      included: [
        { type: 'package', attributes: { tracking_number: 'TEST123', label_url: 'https://example.com/test.pdf' } },
        { type: 'address', attributes: { name: 'Not a package' } },
      ],
    })));
  const result = await getShipment({ MODE: 'sandbox', SKYDROPX_ENVIRONMENT: 'sandbox', SKYDROPX_CLIENT_ID: 'test', SKYDROPX_CLIENT_SECRET: 'test' } as Env, 'shipment-test');
  expect(result.workflow).toBe('success');
  expect(result.cost).toBe(11178);
  expect(result.packages).toEqual([{ tracking_number: 'TEST123', label_url: 'https://example.com/test.pdf' }]);
});
