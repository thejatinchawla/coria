-- Enum value must be committed before use in indexes/functions (Postgres limitation).
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'direct';
