-- Number of tickets purchased on an attendance, when a receipt exposes it.
alter table attendances
  add column if not exists ticket_quantity integer check (ticket_quantity is null or ticket_quantity > 0);
