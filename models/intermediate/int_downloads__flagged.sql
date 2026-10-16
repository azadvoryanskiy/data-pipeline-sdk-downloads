-- Both sources in one table, with the product attached and every value that is
-- not a real count flagged rather than deleted.
--
-- npm answers 0 for a day it has not published yet and for days it lost: on
-- 6 Oct 2026 every package read 0. So a day where nearly every package of a
-- source reads 0 is a missing day. A single package reading 0 while it usually
-- gets thousands a day is a dropout. Neither is a real zero.

with downloads as (
    select * from {{ ref('stg_npm__downloads') }}
    union all
    select * from {{ ref('stg_pypi__downloads') }}
),

day_quality as (
    select
        source,
        day,
        avg((downloads = 0)::int) as share_of_packages_at_zero
    from downloads
    group by source, day
),

with_usual_level as (
    select
        *,
        median(downloads) over (
            partition by source, package
            order by day
            rows between 7 preceding and 1 preceding
        ) as median_previous_week
    from downloads
)

select
    d.source,
    d.package,
    p.product,
    p.category,
    d.day,
    d.downloads,
    d.fetched_at,
    q.share_of_packages_at_zero >= 0.9                       as is_missing_day,
    d.downloads = 0
        and q.share_of_packages_at_zero < 0.9
        and d.median_previous_week >= 1000                   as is_dropout,
    case
        when q.share_of_packages_at_zero >= 0.9 then null
        when d.downloads = 0 and d.median_previous_week >= 1000 then null
        else d.downloads
    end                                                      as clean_downloads
from with_usual_level as d
join day_quality as q using (source, day)
join {{ ref('packages') }} as p using (source, package)
