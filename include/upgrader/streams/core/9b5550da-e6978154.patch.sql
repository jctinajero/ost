/**
* @signature e69781546e08be96d787199a911d0ffe
* @version v1.14.0
* @title Thread Type
*
* This patch adds a new field to the Thread Event table called thread_type
* it allows us to be able to delete threads and thread entries when a ticket
* is deleted while still maintaining dashboard statistics
*
*/
-- Create a temporary table
CREATE TABLE `tmp_table`
SELECT *
FROM `%TABLE_PREFIX%thread_event`;

-- Add indexes to temporary table
ALTER TABLE `tmp_table`
ADD PRIMARY KEY (`id`),
ADD KEY `ticket_state` (`thread_id`,`timestamp`),
ADD KEY `ticket_stats` (`timestamp`),
ADD KEY `uid` (`staff_id`),
ADD KEY `uid_type` (`team_id`),
ADD KEY `event_id` (`event_id`);

-- Add thread_type column
ALTER TABLE `tmp_table`
    ADD `thread_type` char(1) NOT NULL DEFAULT '' AFTER `thread_id`;

-- Update thread_type column
UPDATE `tmp_table` A1
JOIN `%TABLE_PREFIX%thread` A2 ON A1.thread_id = A2.id
SET A1.thread_type = A2.object_type;

-- Delete unneeded threads
DELETE A1
FROM `%TABLE_PREFIX%thread` A1
JOIN `%TABLE_PREFIX%thread_event` A2 ON A2.thread_id = A1.id
WHERE A2.event_id = 14;

-- Delete unneeded thread entries
DELETE A1
FROM `%TABLE_PREFIX%thread_entry` A1
LEFT JOIN `%TABLE_PREFIX%thread` A2 ON(A2.id=A1.thread_id)
WHERE A2.id IS NULL;

-- Set deleted threads to 0 in tmp_table
UPDATE `tmp_table` A1
JOIN `tmp_table` A2 ON A2.thread_id = A1.thread_id
SET A2.thread_id = 0
WHERE A1.event_id = 14;

-- Finished with patch
UPDATE `%TABLE_PREFIX%config`
   SET `value` = 'e69781546e08be96d787199a911d0ffe', `updated` = NOW()
   WHERE `key` = 'schema_signature' AND `namespace` = 'core';
