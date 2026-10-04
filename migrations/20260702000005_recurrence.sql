-- M4 #19: recurring tasks. A task carries an optional recurrence rule (a compact RRULE subset,
-- e.g. 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'); NULL means a one-off task. Recurrence math lives in
-- atlas-core::recur (and its TS mirror); the column just persists the rule string.
ALTER TABLE tasks ADD COLUMN recurrence TEXT;
