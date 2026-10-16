-- What the dashboard shows about the pipeline itself: how fresh each source is
-- and how many values were flagged instead of counted.

select
    source,
    count(distinct package)                                        as packages,
    min(day)                                                       as first_day,
    max(day)                                                       as last_day_landed,
    max(day) filter (where not is_missing_day)                     as last_complete_day,
    count(distinct day) filter (
        where is_missing_day
          and day < (select max(day) filter (where not is_missing_day)
                     from {{ ref('int_downloads__flagged') }} as i
                     where i.source = f.source))                   as lost_days,
    count(distinct day) filter (
        where is_missing_day
          and day > (select max(day) filter (where not is_missing_day)
                     from {{ ref('int_downloads__flagged') }} as i
                     where i.source = f.source))                   as days_not_published_yet,
    count(*) filter (where is_dropout)                             as dropouts,
    count(*)                                                       as rows,
    max(fetched_at)                                                as last_fetched_at
from {{ ref('int_downloads__flagged') }} as f
group by source
