-- One row per package per day with a 7-day average that skips flagged values.

select
    source,
    package,
    product,
    category,
    day,
    downloads,
    clean_downloads,
    is_missing_day,
    is_dropout,
    avg(clean_downloads) over (
        partition by source, package
        order by day
        rows between 6 preceding and current row
    ) as avg_7d
from {{ ref('int_downloads__flagged') }}
