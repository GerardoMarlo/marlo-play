-- Availability and meeting point supplied by the owner on 2026-10-26.
-- Preserve enabled, buffers, closures, notice/cutoff and other settings.
UPDATE pickup_settings SET data=json_set(data,
 '$.durationMinutes',5,
 '$.meetingPoint','Entrada principal, a un lado de la tienda Nike.',
 '$.windows',json('[{"day":1,"start":"15:30","end":"16:30"},{"day":2,"start":"15:30","end":"16:30"},{"day":3,"start":"15:30","end":"16:30"},{"day":4,"start":"15:30","end":"16:30"},{"day":5,"start":"15:30","end":"16:30"},{"day":6,"start":"10:30","end":"11:30"},{"day":6,"start":"17:00","end":"19:00"},{"day":0,"start":"10:30","end":"11:30"}]')
) WHERE id=1;
