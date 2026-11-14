CREATE TABLE marketing_subscribers (
  email TEXT PRIMARY KEY,
  consent INTEGER NOT NULL CHECK(consent IN (0,1)),
  recorded_at INTEGER NOT NULL,
  notice_version TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  unsubscribed_at INTEGER
);
