-- Weeks when a source changed how it counts.
--
-- In the week of 24 Aug 2026 every PyPI package fell by a third or more at once
-- and stayed down. Users don't leave all tools in the same week; the counting
-- changed. A break is a week when the typical package of a source falls below
-- 75% of the week before and is still below 80% three weeks later, so a holiday
-- dip that recovers is not a break.

with weekly as (
    select
        source,
        package,
        date_trunc('week', day)::date as week,
        avg(clean_downloads)          as avg_daily
    from {{ ref('int_downloads__flagged') }}
    group by all
    having count(clean_downloads) >= 5
),

levels as (
    select
        *,
        lag(avg_daily)     over w as week_before,
        lead(avg_daily, 3) over w as three_weeks_later
    from weekly
    window w as (partition by source, package order by week)
)

select
    source,
    week                                        as break_week,
    median(avg_daily / week_before)             as level_that_week,
    median(three_weeks_later / week_before)     as level_three_weeks_later,
    count(*)                                    as packages
from levels
where week_before > 0 and three_weeks_later is not null
group by source, week
having median(avg_daily / week_before) < 0.75
   and median(three_weeks_later / week_before) < 0.8
