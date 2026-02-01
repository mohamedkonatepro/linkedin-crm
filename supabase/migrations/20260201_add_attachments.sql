-- Add attachments column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN messages.attachments IS 'Array of attachments: [{type: "image"|"file"|"audio"|"video", url: string, name?: string}]';
