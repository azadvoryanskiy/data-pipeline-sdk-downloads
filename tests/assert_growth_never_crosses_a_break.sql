-- Growth must be empty whenever its six weeks reach back past a counting change,
-- and filled in otherwise.
select *
from {{ ref('product_growth') }}
where (last_break_week > last_week - interval 6 week and growth is not null)
   or ((last_break_week is null or last_break_week <= last_week - interval 6 week) and growth is null)
