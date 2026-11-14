# Pickup reminders and rescheduling

- Existing appointments label the date picker “Reprogramar cita”.
- Customer and owner reminders queue once per appointment version within the two hours before the appointment. Production cron runs every five minutes, so delivery is approximate and subject to mail-provider processing.
- Customer reminders link to the authenticated order booking page. Customer rescheduling is allowed before the current appointment starts; new slots still honor the booking notice and availability rules. Cancellation retains the configured cutoff.
- A verified Calendar reschedule queues customer and owner confirmation messages atomically with the updated appointment. Owner messages include the submitted phone, call link and WhatsApp link.
- Obsolete reminder versions, reminders after the appointment, and reminders queued too early are suppressed. Two-hour reminder keys are distinct from legacy day-ahead keys.
- Local demo emails remain disabled. No real customer messages were sent as a test.

Email copy: customer subject “Tu entrega es en aproximadamente 2 horas — Marlo Games”, with a “Reprogramar cita” button; owner subject “Entrega en aproximadamente 2 horas — Marlo Games”, with order, appointment, meeting point, customer contact and admin link. Owner rescheduling subject: “Cita reprogramada — Marlo Games”.
