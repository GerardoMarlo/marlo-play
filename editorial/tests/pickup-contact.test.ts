import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderEmail } from '../api/email-templates';
import { database } from './db';
import { pickupSettingsSchema, configuredSlots, pickupInstant } from '../src/local-pickup-config';
it('includes the submitted phone and safe call/WhatsApp links in internal pickup notices',()=>{
 for(const kind of ['internal_preparation','internal_pickup_confirmed','internal_pickup_rescheduled','internal_pickup_approaching','internal_pickup_overdue']) {
  const r=renderEmail(kind,{name:'Cliente',phone:'+523312345678',delivery:'local'});
  expect(r.html).toContain('Teléfono: +523312345678');
  expect(r.html).toContain('href="tel:+523312345678"');
  expect(r.html).toContain('href="https://wa.me/523312345678"');
  expect(r.text).toContain('Abrir WhatsApp: https://wa.me/523312345678');
 }
});
it('offers a website rescheduling action in the two-hour reminder',()=>{
 const r=renderEmail('pickup_reminder',{orderNumber:'MG-2026-000001',delivery:'local'});
 expect(r.subject).toContain('2 horas');
 expect(r.text).toContain('Reprogramar cita: https://marlo.games/pedido/agendar-entrega');
 expect(r.html).toContain('>Reprogramar cita</a>');
});
it('omits contact shortcuts for customers and invalid phone values',()=>{
 expect(renderEmail('pickup_confirmed',{phone:'+523312345678'}).html).not.toContain('wa.me');
 for(const phone of ['', 'javascript:alert(3312345678)', '123', '<script>3312345678</script>']) {
  const r=renderEmail('internal_pickup_confirmed',{phone});
  expect(r.html).not.toContain('href="tel:');expect(r.html).not.toContain('wa.me');expect(r.html).not.toContain('<script>');
 }
 expect(renderEmail('internal_pickup_confirmed',{phone:'33 1234 5678'}).html).toContain('https://wa.me/523312345678');
});
it('applies owner availability and Nike meeting point while preserving disabled status and closures',()=>{
 const d=database();
 d.sqlite.exec(`UPDATE pickup_settings SET data=json_set(data,'$.closures',json('[{"date":"2026-12-25","start":"00:00","end":"23:59"}]')) WHERE id=1`);
 d.sqlite.exec(readFileSync(new URL('../migrations/schema/0009_pickup_availability.sql',import.meta.url),'utf8'));
 const s=pickupSettingsSchema.parse(JSON.parse(String(d.sqlite.prepare('SELECT data FROM pickup_settings').get()?.data)));
 expect(s.enabled).toBe(false);expect(s.durationMinutes).toBe(5);expect(s.closures).toHaveLength(1);
 expect(s.meetingPoint).toBe('Entrada principal, a un lado de la tienda Nike.');
 const now=pickupInstant('2026-10-26','08:00');
 expect(configuredSlots(s,'2026-10-27',now)).toHaveLength(12);
 const saturday=configuredSlots(s,'2026-10-31',now);
 expect(saturday).toHaveLength(36);
 expect(saturday.some(v=>v.start===pickupInstant('2026-10-31','12:00'))).toBe(false);
 expect(configuredSlots(s,'2026-11-01',now)).toHaveLength(12);
});
