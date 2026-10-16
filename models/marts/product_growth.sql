-- Momentum per product: the latest three complete weeks against the three weeks
-- before. Whole weeks keep the weekday mix equal (weekends run at about half of
-- a weekday). If either window reaches back past a week when one of the
-- product's sources changed its counting, the growth is left empty and the
-- reason is given, because the two windows would not be measuring the same thing.

with latest as (
    select max(week) as last_week from {{ ref('product_weekly') }}
),

windows as (
    select
        w.product,
        w.category,
        l.last_week,
        avg(w.avg_daily_downloads) filter (where w.week > l.last_week - interval 3 week)
            as avg_daily_now,
        avg(w.avg_daily_downloads) filter (
            where w.week >  l.last_week - interval 6 week
              and w.week <= l.last_week - interval 3 week)
            as avg_daily_before
    from {{ ref('product_weekly') }} as w
    cross join latest as l
    group by all
),

breaks as (
    select p.product, max(b.break_week) as last_break_week
    from {{ ref('packages') }} as p
    join {{ ref('int_source_breaks') }} as b using (source)
    group by p.product
)

select
    w.product,
    w.category,
    w.last_week,
    round(w.avg_daily_now)                                       as avg_daily_now,
    round(w.avg_daily_before)                                    as avg_daily_before,
    b.last_break_week,
    case when b.last_break_week > w.last_week - interval 6 week then null
         else w.avg_daily_now / w.avg_daily_before - 1 end       as growth,
    case when b.last_break_week > w.last_week - interval 6 week
         then 'source changed its counting in the week of ' || strftime(b.last_break_week, '%-d %b %Y')
    end                                                          as growth_note
from windows as w
left join breaks as b using (product)
