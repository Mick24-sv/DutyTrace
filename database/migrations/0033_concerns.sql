CREATE TABLE concerns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 sender_id uuid NOT NULL REFERENCES users(id),
 recipient_id uuid NOT NULL REFERENCES users(id),
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 160),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','under_review','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_id<>recipient_id)
);
CREATE TABLE concern_participants (
 concern_id uuid NOT NULL REFERENCES concerns(id),
 user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(concern_id,user_id)
);
CREATE INDEX concern_participants_user ON concern_participants(user_id,concern_id);
CREATE TABLE concern_messages (
 seq bigserial UNIQUE NOT NULL,
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 concern_id uuid NOT NULL REFERENCES concerns(id),
 author_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL DEFAULT 'message' CHECK(kind IN ('message','forward','status')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX concern_messages_thread ON concern_messages(concern_id,created_at,id);
CREATE INDEX concerns_recent ON concerns(institution_id,updated_at DESC);
