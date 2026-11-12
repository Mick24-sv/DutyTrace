-- Inbox organization belongs to each participant, not the shared conversation.
ALTER TABLE concern_participants
 ADD COLUMN pinned boolean NOT NULL DEFAULT false,
 ADD COLUMN archived boolean NOT NULL DEFAULT false,
 ADD COLUMN deleted boolean NOT NULL DEFAULT false;
